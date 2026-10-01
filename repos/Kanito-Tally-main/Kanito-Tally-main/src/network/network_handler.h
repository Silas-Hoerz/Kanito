// network/network_handler.h
#ifndef KANITO_TALLY_NETWORK_NETWORK_HANDLER_H_
#define KANITO_TALLY_NETWORK_NETWORK_HANDLER_H_

#include <AsyncUDP.h>
#include <WiFi.h>
#include <pb_decode.h>
#include <pb_encode.h>

#include "Arduino.h"
#include "config.h"
#include "esp_wifi.h"
#include "protocol.pb.h"

using InBoundMessage = protocol_v1_HubToTally;
using OutBoundMessage = protocol_v1_TallyToHub;

enum class NetworkState { kDisconnected, kConnecting, kConnected };

enum class SignalQuality { kExcellent, kGood, kPoor, kCritical };

class NetworkHandler {
 public:
  explicit NetworkHandler();

  void Connect(const char* ssid, const char* password);
  void Disconnect();
  void Update();

  NetworkState GetState();
  bool IsConnected();
  int8_t GetRssi();
  bool GetLatestPayload(InBoundMessage& out_payload);
  void SendTelemetry(const OutBoundMessage& telemetry_data);

 private:
  void EvaluateSignalStrength();

  NetworkState current_state_ = NetworkState::kDisconnected;
  uint32_t connection_start_time_ = 0;
  uint32_t last_reconnect_attempt_ = 0;
  uint32_t last_rssi_check_time_ = 0;

  SignalQuality current_signal_quality_ = SignalQuality::kExcellent;

  char ssid_[33];
  char password_[64];
  const uint16_t kDefaultUdpPort = 4444;

  IPAddress local_ip_;
  int8_t rssi_;
  int8_t tx_power_ = 78;

  bool udp_initialized_ = false;

  AsyncUDP udp_;

  InBoundMessage incoming_payload_;
  bool has_new_payload_ = false;

  static constexpr uint32_t kConnectionTimeoutMs = 10000;
  static constexpr uint32_t kReconnectIntervallMs = 5000;
};

#endif  // KANITO_TALLY_NETWORK_NETWORK_HANDLER_H_