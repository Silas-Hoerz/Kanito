#ifndef KANITO_TALLY_STORAGE_STORAGE_HANDLER_H_
#define KANITO_TALLY_STORAGE_STORAGE_HANDLER_H_

#include <Arduino.h>
#include <Preferences.h>

class StorageHandler {
 public:
  StorageHandler();

  bool LoadWifiConfig(char* out_ssid, size_t max_ssid_len, char* out_password,
                      size_t max_pass_len);

  void SaveWifiConfig(const char* ssid, const char* password);

  void ClearConfig();

 private:
  Preferences preferences_;

  const char* kNamespace = "tally_cfg";

  const char* kKeySsid = "wifi_ssid";
  const char* kKeyPass = "wifi_pass";
};

#endif  // KANITO_TALLY_STORAGE_STORAGE_HANDLER_H_
