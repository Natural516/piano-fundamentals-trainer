#include "miniaudio.h"
#include "poc_protocol.h"

#include <audioclient.h>
#include <propkeydef.h>
#include <functiondiscoverykeys_devpkey.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <windows.h>
#include <wrl/client.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using Microsoft::WRL::ComPtr;
using piano::native_audio_poc::PacketType;
using piano::native_audio_poc::PipePacket;
using piano::native_audio_poc::kPacketMagic;
using piano::native_audio_poc::kProtocolVersion;

namespace {

constexpr ma_uint32 kApplicationSampleRate = 48'000;
constexpr ma_uint32 kApplicationChannels = 2;
constexpr ma_uint32 kRequestedPeriodFrames = 128;
constexpr std::size_t kCommandQueueCapacity = 8'192;
constexpr std::size_t kMetricCapacity = 200'000;

std::uint64_t qpcNanoseconds() noexcept {
  static const std::uint64_t frequency = [] {
    LARGE_INTEGER value{};
    QueryPerformanceFrequency(&value);
    return static_cast<std::uint64_t>(value.QuadPart);
  }();

  LARGE_INTEGER counter{};
  QueryPerformanceCounter(&counter);
  const std::uint64_t ticks = static_cast<std::uint64_t>(counter.QuadPart);
  const std::uint64_t wholeSeconds = ticks / frequency;
  const std::uint64_t remainder = ticks % frequency;
  return wholeSeconds * 1'000'000'000ULL + remainder * 1'000'000'000ULL / frequency;
}

std::string utf8(const std::wstring& value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(
    CP_UTF8,
    0,
    value.data(),
    static_cast<int>(value.size()),
    nullptr,
    0,
    nullptr,
    nullptr
  );
  if (size <= 0) return {};
  std::string output(static_cast<std::size_t>(size), '\0');
  WideCharToMultiByte(
    CP_UTF8,
    0,
    value.data(),
    static_cast<int>(value.size()),
    output.data(),
    size,
    nullptr,
    nullptr
  );
  return output;
}

std::string jsonEscape(const std::string& input) {
  std::ostringstream output;
  for (const unsigned char character : input) {
    switch (character) {
      case '"': output << "\\\""; break;
      case '\\': output << "\\\\"; break;
      case '\b': output << "\\b"; break;
      case '\f': output << "\\f"; break;
      case '\n': output << "\\n"; break;
      case '\r': output << "\\r"; break;
      case '\t': output << "\\t"; break;
      default:
        if (character < 0x20) {
          output << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                 << static_cast<int>(character) << std::dec;
        } else {
          output << character;
        }
    }
  }
  return output.str();
}

bool containsCaseInsensitive(const std::string& value, const std::string& needle) {
  const auto lower = [](const unsigned char character) {
    return static_cast<char>(std::tolower(character));
  };
  std::string left(value.size(), '\0');
  std::string right(needle.size(), '\0');
  std::transform(value.begin(), value.end(), left.begin(), lower);
  std::transform(needle.begin(), needle.end(), right.begin(), lower);
  return left.find(right) != std::string::npos;
}

std::string waveFormatName(const WAVEFORMATEX* format) {
  if (format == nullptr) return "unknown";
  if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return "IEEE_FLOAT";
  if (format->wFormatTag == WAVE_FORMAT_PCM) return "PCM";
  if (format->wFormatTag == WAVE_FORMAT_EXTENSIBLE && format->cbSize >= 22) {
    const auto* extensible = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
    if (extensible->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) return "EXTENSIBLE_IEEE_FLOAT";
    if (extensible->SubFormat == KSDATAFORMAT_SUBTYPE_PCM) return "EXTENSIBLE_PCM";
    return "EXTENSIBLE_OTHER";
  }
  return "FORMAT_TAG_" + std::to_string(format->wFormatTag);
}

const char* maFormatName(const ma_format format) noexcept {
  switch (format) {
    case ma_format_u8: return "u8";
    case ma_format_s16: return "s16";
    case ma_format_s24: return "s24";
    case ma_format_s32: return "s32";
    case ma_format_f32: return "f32";
    default: return "unknown";
  }
}

std::string classifyPeriod(const ma_uint32 frames) {
  if (frames <= 128) return "excellent";
  if (frames <= 256) return "acceptable";
  if (frames <= 480) return "marginal";
  return "fail";
}

struct EndpointDiagnostics {
  ComPtr<IMMDevice> device;
  std::wstring endpointId;
  std::wstring endpointName;
  std::string mixFormat;
  UINT32 mixSampleRate = 0;
  WORD mixChannels = 0;
  WORD mixBitsPerSample = 0;
  UINT32 defaultPeriod = 0;
  UINT32 fundamentalPeriod = 0;
  UINT32 minimumPeriod = 0;
  UINT32 maximumPeriod = 0;
};

EndpointDiagnostics queryFiiOK11Endpoint() {
  ComPtr<IMMDeviceEnumerator> enumerator;
  HRESULT result = CoCreateInstance(
    __uuidof(MMDeviceEnumerator),
    nullptr,
    CLSCTX_ALL,
    IID_PPV_ARGS(&enumerator)
  );
  if (FAILED(result)) throw std::runtime_error("Unable to create the Windows audio endpoint enumerator");

  ComPtr<IMMDeviceCollection> collection;
  result = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection);
  if (FAILED(result)) throw std::runtime_error("Unable to enumerate active Windows render endpoints");

  UINT count = 0;
  collection->GetCount(&count);
  for (UINT index = 0; index < count; ++index) {
    ComPtr<IMMDevice> device;
    if (FAILED(collection->Item(index, &device))) continue;

    ComPtr<IPropertyStore> properties;
    if (FAILED(device->OpenPropertyStore(STGM_READ, &properties))) continue;

    PROPVARIANT friendlyName;
    PropVariantInit(&friendlyName);
    const HRESULT propertyResult = properties->GetValue(PKEY_Device_FriendlyName, &friendlyName);
    const std::wstring name = SUCCEEDED(propertyResult) && friendlyName.vt == VT_LPWSTR
      ? friendlyName.pwszVal
      : L"";
    PropVariantClear(&friendlyName);
    if (name.find(L"FiiO K11") == std::wstring::npos) continue;

    LPWSTR rawId = nullptr;
    if (FAILED(device->GetId(&rawId)) || rawId == nullptr) {
      throw std::runtime_error("Unable to read the FiiO K11 endpoint ID");
    }

    EndpointDiagnostics diagnostics;
    diagnostics.device = device;
    diagnostics.endpointId = rawId;
    diagnostics.endpointName = name;
    CoTaskMemFree(rawId);

    ComPtr<IAudioClient3> client;
    result = device->Activate(__uuidof(IAudioClient3), CLSCTX_ALL, nullptr, &client);
    if (FAILED(result)) throw std::runtime_error("FiiO K11 does not expose IAudioClient3");

    WAVEFORMATEX* mixFormat = nullptr;
    result = client->GetMixFormat(&mixFormat);
    if (FAILED(result) || mixFormat == nullptr) {
      throw std::runtime_error("Unable to query the FiiO K11 mix format");
    }

    diagnostics.mixFormat = waveFormatName(mixFormat);
    diagnostics.mixSampleRate = mixFormat->nSamplesPerSec;
    diagnostics.mixChannels = mixFormat->nChannels;
    diagnostics.mixBitsPerSample = mixFormat->wBitsPerSample;
    result = client->GetSharedModeEnginePeriod(
      mixFormat,
      &diagnostics.defaultPeriod,
      &diagnostics.fundamentalPeriod,
      &diagnostics.minimumPeriod,
      &diagnostics.maximumPeriod
    );
    CoTaskMemFree(mixFormat);
    if (FAILED(result)) throw std::runtime_error("Unable to query the FiiO K11 Shared engine periods");
    return diagnostics;
  }

  throw std::runtime_error("No active FiiO K11 render endpoint was found");
}

UINT32 queryCurrentEnginePeriod(const ComPtr<IMMDevice>& device, UINT32& sampleRate) {
  ComPtr<IAudioClient3> client;
  if (FAILED(device->Activate(__uuidof(IAudioClient3), CLSCTX_ALL, nullptr, &client))) return 0;
  WAVEFORMATEX* format = nullptr;
  UINT32 period = 0;
  const HRESULT result = client->GetCurrentSharedModeEnginePeriod(&format, &period);
  if (SUCCEEDED(result) && format != nullptr) sampleRate = format->nSamplesPerSec;
  if (format != nullptr) CoTaskMemFree(format);
  return SUCCEEDED(result) ? period : 0;
}

std::vector<float> loadPredecodedPcm(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary | std::ios::ate);
  if (!input) throw std::runtime_error("Unable to open the predecoded C4 PCM sample");
  const std::streamsize bytes = input.tellg();
  if (bytes <= 0 || bytes % static_cast<std::streamsize>(sizeof(float) * kApplicationChannels) != 0) {
    throw std::runtime_error("The predecoded C4 PCM sample has an invalid size");
  }
  input.seekg(0, std::ios::beg);
  std::vector<float> sample(static_cast<std::size_t>(bytes) / sizeof(float));
  input.read(reinterpret_cast<char*>(sample.data()), bytes);
  if (!input) throw std::runtime_error("Unable to read the complete predecoded C4 PCM sample");
  return sample;
}

struct AudioCommand {
  std::uint64_t eventId = 0;
  double webMidiToPipeWriteNs = 0;
  double pipeWriteQpcNs = 0;
  std::uint64_t helperReceiveQpcNs = 0;
  std::uint64_t commandQueuedQpcNs = 0;
  std::uint8_t midiNumber = 0;
  std::uint8_t velocity = 0;
};

struct LatencyMetric {
  std::uint64_t webMidiToPipeWriteNs = 0;
  std::uint64_t pipeWriteToHelperReceiveNs = 0;
  std::uint64_t helperReceiveToCommandQueueNs = 0;
  std::uint64_t commandQueueToAudioCallbackNs = 0;
};

class CommandQueue {
public:
  bool push(const AudioCommand& command) noexcept {
    const std::size_t head = head_.load(std::memory_order_relaxed);
    const std::size_t next = (head + 1) % kCommandQueueCapacity;
    if (next == tail_.load(std::memory_order_acquire)) return false;
    entries_[head] = command;
    head_.store(next, std::memory_order_release);
    return true;
  }

  bool pop(AudioCommand& command) noexcept {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);
    if (tail == head_.load(std::memory_order_acquire)) return false;
    command = entries_[tail];
    tail_.store((tail + 1) % kCommandQueueCapacity, std::memory_order_release);
    return true;
  }

private:
  std::array<AudioCommand, kCommandQueueCapacity> entries_{};
  std::atomic<std::size_t> head_{0};
  std::atomic<std::size_t> tail_{0};
};

struct EngineState {
  std::vector<float> sample;
  CommandQueue commandQueue;
  std::array<LatencyMetric, kMetricCapacity> metrics{};
  std::atomic<std::size_t> metricCount{0};
  std::atomic<std::uint64_t> queueOverruns{0};
  std::atomic<std::uint64_t> metricOverruns{0};
  std::atomic<std::uint64_t> underruns{0};
  std::atomic<std::uint64_t> glitches{0};
  std::atomic<std::uint64_t> deviceInvalidations{0};
  std::atomic<bool> reportRequested{false};
  std::atomic<bool> running{true};
  std::size_t playbackCursorFrames = 0;
  float playbackGain = 0.0F;
  bool active = false;
  std::uint64_t previousCallbackQpcNs = 0;
  std::uint64_t expectedCallbackNs = 0;
};

void storeMetric(EngineState& state, const AudioCommand& command, const std::uint64_t consumedAt) noexcept {
  const std::size_t index = state.metricCount.load(std::memory_order_relaxed);
  if (index >= state.metrics.size()) {
    state.metricOverruns.fetch_add(1, std::memory_order_relaxed);
    return;
  }

  state.metrics[index] = {
    command.webMidiToPipeWriteNs > 0
      ? static_cast<std::uint64_t>(command.webMidiToPipeWriteNs)
      : 0,
    static_cast<double>(command.helperReceiveQpcNs) >= command.pipeWriteQpcNs
      ? static_cast<std::uint64_t>(static_cast<double>(command.helperReceiveQpcNs) - command.pipeWriteQpcNs)
      : 0,
    command.commandQueuedQpcNs >= command.helperReceiveQpcNs
      ? command.commandQueuedQpcNs - command.helperReceiveQpcNs
      : 0,
    consumedAt >= command.commandQueuedQpcNs
      ? consumedAt - command.commandQueuedQpcNs
      : 0
  };
  state.metricCount.store(index + 1, std::memory_order_release);
  if ((index + 1) % 1000 == 0) state.reportRequested.store(true, std::memory_order_release);
}

void audioCallback(ma_device* device, void* output, const void*, ma_uint32 frameCount) noexcept {
  auto& state = *static_cast<EngineState*>(device->pUserData);
  auto* frames = static_cast<float*>(output);
  std::fill_n(frames, static_cast<std::size_t>(frameCount) * kApplicationChannels, 0.0F);

  const std::uint64_t callbackAt = qpcNanoseconds();
  if (
    state.previousCallbackQpcNs != 0
    && state.expectedCallbackNs != 0
    && callbackAt - state.previousCallbackQpcNs > state.expectedCallbackNs * 5 / 2
  ) {
    state.glitches.fetch_add(1, std::memory_order_relaxed);
  }
  state.previousCallbackQpcNs = callbackAt;

  AudioCommand command;
  while (state.commandQueue.pop(command)) {
    storeMetric(state, command, callbackAt);
    state.playbackCursorFrames = 0;
    const float normalizedVelocity = static_cast<float>(command.velocity) / 127.0F;
    state.playbackGain = normalizedVelocity * normalizedVelocity;
    state.active = command.velocity > 0;
  }

  if (!state.active) return;
  const std::size_t sampleFrames = state.sample.size() / kApplicationChannels;
  const std::size_t available = sampleFrames > state.playbackCursorFrames
    ? sampleFrames - state.playbackCursorFrames
    : 0;
  const std::size_t framesToCopy = std::min<std::size_t>(frameCount, available);
  for (std::size_t frame = 0; frame < framesToCopy; ++frame) {
    const std::size_t sampleOffset = (state.playbackCursorFrames + frame) * kApplicationChannels;
    const std::size_t outputOffset = frame * kApplicationChannels;
    frames[outputOffset] = state.sample[sampleOffset] * state.playbackGain;
    frames[outputOffset + 1] = state.sample[sampleOffset + 1] * state.playbackGain;
  }
  state.playbackCursorFrames += framesToCopy;
  if (state.playbackCursorFrames >= sampleFrames) state.active = false;
}

void deviceNotification(const ma_device_notification* notification) noexcept {
  if (notification == nullptr || notification->pDevice == nullptr) return;
  auto& state = *static_cast<EngineState*>(notification->pDevice->pUserData);
  switch (notification->type) {
    case ma_device_notification_type_interruption_began:
    case ma_device_notification_type_rerouted:
      state.deviceInvalidations.fetch_add(1, std::memory_order_relaxed);
      break;
    default:
      break;
  }
}

void miniaudioLog(void* userData, ma_uint32 level, const char* message) noexcept {
  auto& state = *static_cast<EngineState*>(userData);
  if (message != nullptr) {
    if (std::strstr(message, "underrun") != nullptr || std::strstr(message, "Underflow") != nullptr) {
      state.underruns.fetch_add(1, std::memory_order_relaxed);
    }
    if (
      std::strstr(message, "DEVICE_INVALIDATED") != nullptr
      || std::strstr(message, "device invalidated") != nullptr
    ) {
      state.deviceInvalidations.fetch_add(1, std::memory_order_relaxed);
    }
  }
  if (level <= MA_LOG_LEVEL_WARNING && message != nullptr) {
    std::cerr << "[miniaudio] " << message;
  }
}

struct Percentiles {
  double p50 = 0;
  double p95 = 0;
  double p99 = 0;
  double max = 0;
};

Percentiles calculatePercentiles(std::vector<std::uint64_t> values) {
  if (values.empty()) return {};
  std::sort(values.begin(), values.end());
  const auto valueAt = [&values](const double percentile) {
    const std::size_t index = static_cast<std::size_t>(
      std::ceil(percentile * static_cast<double>(values.size()))
    ) - 1;
    return static_cast<double>(values[std::min(index, values.size() - 1)]) / 1000.0;
  };
  return {valueAt(0.50), valueAt(0.95), valueAt(0.99), valueAt(1.0)};
}

std::string percentileJson(const Percentiles& values) {
  std::ostringstream output;
  output << std::fixed << std::setprecision(3)
         << "{\"p50_us\":" << values.p50
         << ",\"p95_us\":" << values.p95
         << ",\"p99_us\":" << values.p99
         << ",\"max_us\":" << values.max << '}';
  return output.str();
}

void printMetrics(const EngineState& state) {
  const std::size_t count = std::min(state.metricCount.load(std::memory_order_acquire), state.metrics.size());
  std::vector<std::uint64_t> webToPipe;
  std::vector<std::uint64_t> pipeToHelper;
  std::vector<std::uint64_t> helperToQueue;
  std::vector<std::uint64_t> queueToCallback;
  webToPipe.reserve(count);
  pipeToHelper.reserve(count);
  helperToQueue.reserve(count);
  queueToCallback.reserve(count);

  for (std::size_t index = 0; index < count; ++index) {
    const LatencyMetric& metric = state.metrics[index];
    webToPipe.push_back(metric.webMidiToPipeWriteNs);
    pipeToHelper.push_back(metric.pipeWriteToHelperReceiveNs);
    helperToQueue.push_back(metric.helperReceiveToCommandQueueNs);
    queueToCallback.push_back(metric.commandQueueToAudioCallbackNs);
  }

  std::cout
    << "[native-audio-poc] METRICS {\"events\":" << count
    << ",\"web_midi_to_pipe_write\":" << percentileJson(calculatePercentiles(std::move(webToPipe)))
    << ",\"pipe_write_to_helper_receive\":" << percentileJson(calculatePercentiles(std::move(pipeToHelper)))
    << ",\"helper_receive_to_audio_queue\":" << percentileJson(calculatePercentiles(std::move(helperToQueue)))
    << ",\"audio_queue_to_callback\":" << percentileJson(calculatePercentiles(std::move(queueToCallback)))
    << ",\"underruns\":" << state.underruns.load(std::memory_order_relaxed)
    << ",\"glitches\":" << state.glitches.load(std::memory_order_relaxed)
    << ",\"queue_overruns\":" << state.queueOverruns.load(std::memory_order_relaxed)
    << ",\"metric_overruns\":" << state.metricOverruns.load(std::memory_order_relaxed)
    << ",\"device_invalidations\":" << state.deviceInvalidations.load(std::memory_order_relaxed)
    << ",\"helper_crashes\":0}\n"
    << std::flush;
}

void reporterLoop(EngineState& state) {
  while (state.running.load(std::memory_order_acquire)) {
    if (state.reportRequested.exchange(false, std::memory_order_acq_rel)) printMetrics(state);
    Sleep(25);
  }
  if (state.metricCount.load(std::memory_order_acquire) > 0) printMetrics(state);
}

std::wstring argumentValue(const int argc, wchar_t** argv, const std::wstring& name) {
  for (int index = 1; index + 1 < argc; ++index) {
    if (argv[index] == name) return argv[index + 1];
  }
  return {};
}

ma_device_id findMiniaudioDeviceId(ma_context& context) {
  ma_device_info* playbackInfos = nullptr;
  ma_uint32 playbackCount = 0;
  if (ma_context_get_devices(&context, &playbackInfos, &playbackCount, nullptr, nullptr) != MA_SUCCESS) {
    throw std::runtime_error("miniaudio could not enumerate playback devices");
  }
  for (ma_uint32 index = 0; index < playbackCount; ++index) {
    if (containsCaseInsensitive(playbackInfos[index].name, "FiiO K11")) return playbackInfos[index].id;
  }
  throw std::runtime_error("miniaudio did not expose a FiiO K11 playback device");
}

void runPipeServer(const std::wstring& pipeName, EngineState& state) {
  while (state.running.load(std::memory_order_acquire)) {
    HANDLE pipe = CreateNamedPipeW(
      pipeName.c_str(),
      // Node's net.Socket opens named pipes as duplex handles even though this
      // protocol only sends renderer -> helper. A duplex server handle keeps
      // libuv from closing its client side immediately.
      PIPE_ACCESS_DUPLEX,
      PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
      1,
      64 * 1024,
      64 * 1024,
      0,
      nullptr
    );
    if (pipe == INVALID_HANDLE_VALUE) throw std::runtime_error("Unable to create the native audio POC named pipe");

    const BOOL connected = ConnectNamedPipe(pipe, nullptr)
      ? TRUE
      : GetLastError() == ERROR_PIPE_CONNECTED;
    if (!connected) {
      CloseHandle(pipe);
      if (state.running.load(std::memory_order_acquire)) Sleep(50);
      continue;
    }

    std::cout << "[native-audio-poc] PIPE_CONNECTED\n" << std::flush;
    for (;;) {
      PipePacket packet{};
      DWORD bytesRead = 0;
      const BOOL read = ReadFile(pipe, &packet, sizeof(packet), &bytesRead, nullptr);
      const std::uint64_t receivedAt = qpcNanoseconds();
      if (!read || bytesRead != sizeof(packet)) break;
      if (packet.magic != kPacketMagic || packet.version != kProtocolVersion) continue;

      if (packet.type == PacketType::noteOn) {
        AudioCommand command{
          packet.eventId,
          packet.webMidiToPipeWriteNs,
          packet.pipeWriteQpcNs,
          receivedAt,
          0,
          packet.midiNumber,
          packet.velocity
        };
        command.commandQueuedQpcNs = qpcNanoseconds();
        if (!state.commandQueue.push(command)) {
          state.queueOverruns.fetch_add(1, std::memory_order_relaxed);
        }
      } else if (packet.type == PacketType::report) {
        state.reportRequested.store(true, std::memory_order_release);
      } else if (packet.type == PacketType::shutdown) {
        state.running.store(false, std::memory_order_release);
        break;
      }
    }

    DisconnectNamedPipe(pipe);
    CloseHandle(pipe);
  }
}

} // namespace

int wmain(int argc, wchar_t** argv) {
  try {
    const std::wstring pipeName = argumentValue(argc, argv, L"--pipe");
    const std::wstring samplePath = argumentValue(argc, argv, L"--sample");
    if (pipeName.empty() || samplePath.empty()) {
      std::cerr << "Usage: piano_native_audio_poc --pipe <name> --sample <C4-48k-f32.pcm>\n";
      return 2;
    }

    const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(comResult) && comResult != RPC_E_CHANGED_MODE) {
      throw std::runtime_error("Unable to initialize COM for WASAPI");
    }

    auto state = std::make_unique<EngineState>();
    state->sample = loadPredecodedPcm(samplePath);
    const EndpointDiagnostics endpoint = queryFiiOK11Endpoint();

    ma_log log{};
    if (ma_log_init(nullptr, &log) != MA_SUCCESS) throw std::runtime_error("Unable to initialize miniaudio logging");
    const ma_log_callback logCallback = ma_log_callback_init(miniaudioLog, state.get());
    ma_log_register_callback(&log, logCallback);

    ma_backend backend = ma_backend_wasapi;
    ma_context_config contextConfig = ma_context_config_init();
    contextConfig.pLog = &log;
    ma_context context{};
    if (ma_context_init(&backend, 1, &contextConfig, &context) != MA_SUCCESS) {
      ma_log_uninit(&log);
      throw std::runtime_error("Unable to initialize miniaudio's WASAPI backend");
    }

    const ma_device_id deviceId = findMiniaudioDeviceId(context);
    ma_device_config deviceConfig = ma_device_config_init(ma_device_type_playback);
    deviceConfig.playback.pDeviceID = &deviceId;
    deviceConfig.playback.format = ma_format_f32;
    deviceConfig.playback.channels = kApplicationChannels;
    deviceConfig.sampleRate = kApplicationSampleRate;
    deviceConfig.periodSizeInFrames = kRequestedPeriodFrames;
    deviceConfig.periods = 2;
    deviceConfig.performanceProfile = ma_performance_profile_low_latency;
    deviceConfig.noFixedSizedCallback = MA_TRUE;
    deviceConfig.wasapi.noAutoConvertSRC = MA_TRUE;
    deviceConfig.dataCallback = audioCallback;
    deviceConfig.notificationCallback = deviceNotification;
    deviceConfig.pUserData = state.get();

    ma_device device{};
    if (ma_device_init(&context, &deviceConfig, &device) != MA_SUCCESS) {
      ma_context_uninit(&context);
      ma_log_uninit(&log);
      throw std::runtime_error("Unable to initialize the FiiO K11 miniaudio device");
    }

    const ma_uint32 actualPeriod = device.wasapi.periodSizeInFramesPlayback;
    const ma_uint32 actualPeriods = device.playback.internalPeriods;
    const ma_uint32 actualBufferFrames = device.wasapi.actualBufferSizeInFramesPlayback;
    state->expectedCallbackNs = actualPeriod > 0 && device.playback.internalSampleRate > 0
      ? static_cast<std::uint64_t>(actualPeriod) * 1'000'000'000ULL / device.playback.internalSampleRate
      : 0;

    if (ma_device_start(&device) != MA_SUCCESS) {
      ma_device_uninit(&device);
      ma_context_uninit(&context);
      ma_log_uninit(&log);
      throw std::runtime_error("Unable to start FiiO K11 WASAPI Shared playback");
    }

    UINT32 currentSampleRate = 0;
    const UINT32 currentEnginePeriod = queryCurrentEnginePeriod(endpoint.device, currentSampleRate);

    std::cout
      << "[native-audio-poc] DEVICE {\"endpoint_id\":\"" << jsonEscape(utf8(endpoint.endpointId))
      << "\",\"endpoint_name\":\"" << jsonEscape(utf8(endpoint.endpointName))
      << "\",\"mix_format\":\"" << endpoint.mixFormat
      << "\",\"mix_sample_rate\":" << endpoint.mixSampleRate
      << ",\"mix_channels\":" << endpoint.mixChannels
      << ",\"mix_bits_per_sample\":" << endpoint.mixBitsPerSample
      << ",\"default_engine_period_frames\":" << endpoint.defaultPeriod
      << ",\"fundamental_period_frames\":" << endpoint.fundamentalPeriod
      << ",\"minimum_period_frames\":" << endpoint.minimumPeriod
      << ",\"maximum_period_frames\":" << endpoint.maximumPeriod
      << ",\"requested_period_frames\":" << kRequestedPeriodFrames
      << ",\"actual_period_frames\":" << actualPeriod
      << ",\"actual_period_count\":" << actualPeriods
      << ",\"actual_buffer_frames\":" << actualBufferFrames
      << ",\"current_engine_period_frames\":" << currentEnginePeriod
      << ",\"application_format\":\"f32\""
      << ",\"application_channels\":" << kApplicationChannels
      << ",\"application_sample_rate\":" << kApplicationSampleRate
      << ",\"internal_format\":\"" << maFormatName(device.playback.internalFormat) << '"'
      << ",\"internal_channels\":" << device.playback.internalChannels
      << ",\"internal_sample_rate\":" << device.playback.internalSampleRate
      << ",\"current_engine_sample_rate\":" << currentSampleRate
      << ",\"sample_frames\":" << state->sample.size() / kApplicationChannels
      << ",\"sample_bytes\":" << state->sample.size() * sizeof(float)
      << ",\"period_classification\":\"" << classifyPeriod(actualPeriod) << '"'
      << ",\"sample_rate_requirement_met\":"
      << (device.playback.internalSampleRate == kApplicationSampleRate ? "true" : "false")
      << "}\n" << std::flush;

    std::thread reporter(reporterLoop, std::ref(*state));
    runPipeServer(pipeName, *state);
    state->running.store(false, std::memory_order_release);
    reporter.join();

    ma_device_uninit(&device);
    ma_context_uninit(&context);
    ma_log_uninit(&log);
    if (SUCCEEDED(comResult)) CoUninitialize();
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "[native-audio-poc] FATAL " << error.what() << '\n';
    return 1;
  }
}
