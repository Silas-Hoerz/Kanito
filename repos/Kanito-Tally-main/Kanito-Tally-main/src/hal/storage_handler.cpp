#include "storage_handler.h"

StorageHandler::StorageHandler() {}

bool StorageHandler::LoadWifiConfig(char* out_ssid, size_t max_ssid_len,
                                    char* out_password, size_t max_pass_len) {
  preferences_.begin(kNamespace, true);

  String saved_ssid = preferences_.getString(kKeySsid, "");
  String saved_pass = preferences_.getString(kKeyPass, "");

  preferences_.end();

  if (saved_ssid.length() > 0) {
    strlcpy(out_ssid, saved_ssid.c_str(), max_ssid_len);
    strlcpy(out_password, saved_pass.c_str(), max_pass_len);
    return true;
  }

  return false;
}

void StorageHandler::SaveWifiConfig(const char* ssid, const char* password) {
  preferences_.begin(kNamespace, false);

  preferences_.putString(kKeySsid, ssid);
  preferences_.putString(kKeyPass, password);

  preferences_.end();
}

void StorageHandler::ClearConfig() {
  preferences_.begin(kNamespace, false);
  preferences_.clear();  // Löscht alle Schlüssel in diesem Namespace
  preferences_.end();
}