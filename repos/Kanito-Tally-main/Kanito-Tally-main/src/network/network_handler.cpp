// network/network_handler.cpp

#include "network_handler.h"

NetworkHandler::NetworkHandler() {}

void NetworkHandler::Connect(const char* ssid, const char* password) {
  strlcpy(ssid_, ssid, sizeof(ssid_));
  strlcpy(password_, password, sizeof(password_));
  WiFi.mode(WiFiMode_t::WIFI_MODE_STA);

  // sleep between DTIM Router-Beacons
  esp_wifi_set_ps(wifi_ps_type_t::WIFI_PS_MIN_MODEM);

  WiFi.begin(ssid_, password_);
  current_state_ = NetworkState::kConnecting;
  connection_start_time_ = millis();
}

void NetworkHandler::Disconnect() {
  WiFi.disconnect();
  last_reconnect_attempt_ = millis();
  current_state_ = NetworkState::kDisconnected;
}

void NetworkHandler::Update() {
  switch (current_state_) {
    case NetworkState::kDisconnected:
      if (strlen(ssid_) > 0) {
        if (millis() - last_reconnect_attempt_ > kReconnectIntervallMs) {
          last_reconnect_attempt_ = millis();
          WiFi.begin(ssid_, password_);
          current_state_ = NetworkState::kConnecting;
          connection_start_time_ = millis();
        }
      }
      break;

    case NetworkState::kConnecting:
      if (WiFi.status() == wl_status_t::WL_CONNECTED) {
        current_state_ = NetworkState::kConnected;

        local_ip_ = WiFi.localIP();
        Serial.print("WiFi connected. IP: ");
        Serial.println(local_ip_);

        // UDP Setup
        if (!udp_initialized_) {
          if (udp_.listen(kDefaultUdpPort)) {
            udp_.onPacket([this](AsyncUDPPacket packet) {
              InBoundMessage received_msg = protocol_v1_HubToTally_init_zero;

              pb_istream_t stream =
                  pb_istream_from_buffer(packet.data(), packet.length());
              if (pb_decode(&stream, protocol_v1_HubToTally_fields,
                            &received_msg)) {
                this->incoming_payload_ = received_msg;
                this->has_new_payload_ = true;
              }
            });
            udp_initialized_ = true;
          }
        }
      } else {
        if (millis() - connection_start_time_ > kConnectionTimeoutMs) {
          current_state_ = NetworkState::kDisconnected;
          last_reconnect_attempt_ = millis();
        }
      }
      break;

    case NetworkState::kConnected:
      if (WiFi.status() != wl_status_t::WL_CONNECTED) {
        current_state_ = NetworkState::kDisconnected;
        last_reconnect_attempt_ = millis();
        break;
      }

      EvaluateSignalStrength();

      break;
  }
}

NetworkState NetworkHandler::GetState() { return current_state_; }

bool NetworkHandler::IsConnected() {
  return (current_state_ == NetworkState::kConnected);
}

int8_t NetworkHandler::GetRssi() { return rssi_; }

void NetworkHandler::EvaluateSignalStrength() {
  if (millis() - last_rssi_check_time_ < 2000) return;
  last_rssi_check_time_ = millis();

  rssi_ = WiFi.RSSI();
  int8_t target_tx_power;

  if (rssi_ > -60) {
    current_signal_quality_ = SignalQuality::kExcellent;
    target_tx_power = 40;
  } else if (rssi_ > -70) {
    current_signal_quality_ = SignalQuality::kGood;
    target_tx_power = 56;
  } else if (rssi_ > -80) {
    current_signal_quality_ = SignalQuality::kPoor;
    target_tx_power = 68;
  } else {
    current_signal_quality_ = SignalQuality::kCritical;
    target_tx_power = 78;
  }
  if (target_tx_power != tx_power_) {
    esp_wifi_set_max_tx_power(target_tx_power);
    tx_power_ = target_tx_power;
  }
}

bool NetworkHandler::GetLatestPayload(InBoundMessage& out_payload) {
  if (has_new_payload_) {
    out_payload = incoming_payload_;
    has_new_payload_ = false;
    return true;
  }
  return false;
}

void NetworkHandler::SendTelemetry(const OutBoundMessage& telemetry_data) {
  if (current_state_ != NetworkState::kConnected || !udp_initialized_) {
    return;
  }
  uint8_t buffer[protocol_v1_TallyToHub_size];

  pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));

  if (pb_encode(&stream, protocol_v1_TallyToHub_fields, &telemetry_data)) {
    udp_.broadcastTo(buffer, stream.bytes_written, kDefaultUdpPort);
  } else {
    // Error
  }
}