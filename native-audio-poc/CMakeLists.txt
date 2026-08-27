cmake_minimum_required(VERSION 3.24)

project(piano_native_audio_poc LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

FetchContent_Declare(
  miniaudio
  GIT_REPOSITORY https://github.com/mackron/miniaudio.git
  GIT_TAG 9634bedb5b5a2ca38c1ee7108a9358a4e233f14d
  GIT_SHALLOW FALSE
)

FetchContent_Declare(
  stb
  GIT_REPOSITORY https://github.com/nothings/stb.git
  GIT_TAG 2c980bb59875b0d32144a71867fbdebb2f77cd20
  GIT_SHALLOW FALSE
)

FetchContent_MakeAvailable(miniaudio stb)

add_library(poc_miniaudio STATIC "${miniaudio_SOURCE_DIR}/miniaudio.c")
target_include_directories(poc_miniaudio PUBLIC "${miniaudio_SOURCE_DIR}")
target_compile_definitions(
  poc_miniaudio
  PUBLIC
    MA_ENABLE_ONLY_SPECIFIC_BACKENDS
    MA_ENABLE_WASAPI
    MA_NO_ENCODING
    MA_NO_FLAC
    MA_NO_MP3
)

if(MSVC)
  target_compile_options(poc_miniaudio PRIVATE /W3 /permissive-)
endif()

add_executable(poc_sample_compiler src/sample_compiler.cpp)
target_include_directories(
  poc_sample_compiler
  PRIVATE
    "${miniaudio_SOURCE_DIR}"
    "${stb_SOURCE_DIR}"
)
target_link_libraries(poc_sample_compiler PRIVATE poc_miniaudio)

set(POC_SAMPLE_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../resources/piano-samples/salamander/C4.ogg")
set(POC_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
set(POC_PCM_SAMPLE "${POC_GENERATED_DIR}/C4-48k-f32.pcm")

add_custom_command(
  OUTPUT "${POC_PCM_SAMPLE}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${POC_GENERATED_DIR}"
  COMMAND $<TARGET_FILE:poc_sample_compiler> "${POC_SAMPLE_SOURCE}" "${POC_PCM_SAMPLE}"
  DEPENDS poc_sample_compiler "${POC_SAMPLE_SOURCE}"
  COMMENT "Predecoding the single C4 POC sample to 48 kHz float32 PCM"
  VERBATIM
)

add_custom_target(poc_pcm_sample ALL DEPENDS "${POC_PCM_SAMPLE}")

add_executable(
  piano_native_audio_poc
  src/piano_native_audio_poc.cpp
  src/poc_protocol.h
)
add_dependencies(piano_native_audio_poc poc_pcm_sample)
target_include_directories(piano_native_audio_poc PRIVATE "${miniaudio_SOURCE_DIR}")
target_link_libraries(piano_native_audio_poc PRIVATE poc_miniaudio ole32 propsys uuid)
target_compile_definitions(
  piano_native_audio_poc
  PRIVATE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
    UNICODE
    _UNICODE
)

if(MSVC)
  target_compile_options(piano_native_audio_poc PRIVATE /W4 /permissive- /EHsc)
endif()

add_custom_command(
  TARGET piano_native_audio_poc
  POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${POC_PCM_SAMPLE}"
          "$<TARGET_FILE_DIR:piano_native_audio_poc>/C4-48k-f32.pcm"
  COMMENT "Staging the predecoded C4 sample next to the POC helper"
)
