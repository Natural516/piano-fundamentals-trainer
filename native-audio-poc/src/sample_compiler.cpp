#include "miniaudio.h"
#include "stb_vorbis.c"

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr ma_uint32 kOutputSampleRate = 48'000;
constexpr int kRequiredChannels = 2;

std::vector<float> decodeVorbis(const std::filesystem::path& inputPath, int& sampleRate) {
  int error = VORBIS__no_error;
  stb_vorbis* decoder = stb_vorbis_open_filename(inputPath.string().c_str(), &error, nullptr);
  if (decoder == nullptr) {
    throw std::runtime_error("Unable to open C4 OGG sample, stb_vorbis error " + std::to_string(error));
  }

  const stb_vorbis_info info = stb_vorbis_get_info(decoder);
  if (info.channels != kRequiredChannels || info.sample_rate <= 0) {
    stb_vorbis_close(decoder);
    throw std::runtime_error("The POC sample must be stereo with a valid sample rate");
  }

  sampleRate = info.sample_rate;
  std::vector<float> decoded;
  decoded.reserve(static_cast<std::size_t>(stb_vorbis_stream_length_in_samples(decoder)) * info.channels);
  std::vector<float> chunk(4096U * static_cast<std::size_t>(info.channels));

  for (;;) {
    const int frames = stb_vorbis_get_samples_float_interleaved(
      decoder,
      info.channels,
      chunk.data(),
      static_cast<int>(chunk.size())
    );
    if (frames <= 0) break;
    decoded.insert(decoded.end(), chunk.begin(), chunk.begin() + frames * info.channels);
  }

  stb_vorbis_close(decoder);
  if (decoded.empty()) throw std::runtime_error("The decoded C4 sample is empty");
  return decoded;
}

std::vector<float> resampleTo48Khz(const std::vector<float>& input, ma_uint32 inputRate) {
  if (inputRate == kOutputSampleRate) return input;

  ma_resampler_config config = ma_resampler_config_init(
    ma_format_f32,
    kRequiredChannels,
    inputRate,
    kOutputSampleRate,
    ma_resample_algorithm_linear
  );
  ma_resampler resampler{};
  if (ma_resampler_init(&config, nullptr, &resampler) != MA_SUCCESS) {
    throw std::runtime_error("Unable to initialize the offline 48 kHz resampler");
  }

  const ma_uint64 inputFrames = static_cast<ma_uint64>(input.size() / kRequiredChannels);
  ma_uint64 outputCapacity = 0;
  if (ma_resampler_get_expected_output_frame_count(&resampler, inputFrames, &outputCapacity) != MA_SUCCESS) {
    ma_resampler_uninit(&resampler, nullptr);
    throw std::runtime_error("Unable to calculate the resampled C4 frame count");
  }

  outputCapacity += 8;
  std::vector<float> output(static_cast<std::size_t>(outputCapacity) * kRequiredChannels);
  ma_uint64 consumedFrames = inputFrames;
  ma_uint64 producedFrames = outputCapacity;
  const ma_result result = ma_resampler_process_pcm_frames(
    &resampler,
    input.data(),
    &consumedFrames,
    output.data(),
    &producedFrames
  );
  ma_resampler_uninit(&resampler, nullptr);
  if (result != MA_SUCCESS || consumedFrames != inputFrames || producedFrames == 0) {
    throw std::runtime_error("Unable to resample the C4 sample to 48 kHz");
  }

  output.resize(static_cast<std::size_t>(producedFrames) * kRequiredChannels);
  return output;
}

void writePcm(const std::filesystem::path& outputPath, const std::vector<float>& samples) {
  std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
  if (!output) throw std::runtime_error("Unable to create the predecoded PCM file");
  output.write(
    reinterpret_cast<const char*>(samples.data()),
    static_cast<std::streamsize>(samples.size() * sizeof(float))
  );
  if (!output) throw std::runtime_error("Unable to write the complete predecoded PCM file");
}

} // namespace

int main(int argc, char** argv) {
  try {
    if (argc != 3) {
      std::cerr << "Usage: poc_sample_compiler <C4.ogg> <C4-48k-f32.pcm>\n";
      return 2;
    }

    int inputRate = 0;
    const std::vector<float> decoded = decodeVorbis(argv[1], inputRate);
    const std::vector<float> resampled = resampleTo48Khz(decoded, static_cast<ma_uint32>(inputRate));
    writePcm(argv[2], resampled);

    std::cout
      << "C4 sample predecoded: inputRate=" << inputRate
      << " outputRate=" << kOutputSampleRate
      << " channels=" << kRequiredChannels
      << " frames=" << resampled.size() / kRequiredChannels
      << " bytes=" << resampled.size() * sizeof(float)
      << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "poc_sample_compiler: " << error.what() << '\n';
    return 1;
  }
}
