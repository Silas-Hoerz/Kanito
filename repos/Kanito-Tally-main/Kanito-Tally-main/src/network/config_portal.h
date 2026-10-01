#ifndef KANITO_TALLY_NETWORK_CONFIG_PORTAL_H_
#define KANITO_TALLY_NETWORK_CONFIG_PORTAL_H_

#include <Arduino.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <WiFi.h>

#include "hal/storage_handler.h"  // Unser neues NVS-Gedächtnis

class ConfigPortal {
 public:
  explicit ConfigPortal(StorageHandler& storage);

  void Start();
  void Stop();

  // Muss im Core aufgerufen werden, damit der DNS-Server die Anfragen umleitet
  void Update();

  // Der Core fragt hiermit, ob der User fertig ist, um dann neu zu starten
  bool IsFinished() const;

 private:
  StorageHandler& storage_;
  DNSServer dns_server_;
  AsyncWebServer web_server_;

  bool is_running_ = false;
  bool is_finished_ = false;

  void SetupRoutes();
};

#endif  // KANITO_TALLY_NETWORK_CONFIG_PORTAL_H_