#pragma once

#include <cstdint>

namespace piano::native_audio_poc {

constexpr std::uint32_t kPacketMagic = 0x43335046; // "FP3C" little-endian.
constexpr std::uint16_t kProtocolVersion = 1;

enum class PacketType : std::uint16_t {
  noteOn = 1,
  report = 2,
  shutdown = 3
};

#pragma pack(push, 1)
struct PipePacket {
  std::uint32_t magic;
  std::uint16_t version;
  PacketType type;
  std::uint64_t eventId;
  double webMidiToPipeWriteNs;
  double pipeWriteQpcNs;
  std::uint8_t midiNumber;
  std::uint8_t velocity;
  std::uint8_t reserved[6];
};
#pragma pack(pop)

static_assert(sizeof(PipePacket) == 40, "The named-pipe packet must remain fixed-size.");

} // namespace piano::native_audio_poc
