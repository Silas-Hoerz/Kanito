#include "config_portal.h"

// Ein extrem simples, sauberes HTML-Formular (Dark Mode inklusive)
const char* kHtmlForm = R"HTML(
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; text-align: center; }
  input { width: 90%; padding: 10px; margin: 10px 0; border-radius: 5px; border: none; }
  button { width: 95%; padding: 15px; background: #cf6679; color: white; border: none; border-radius: 5px; font-size: 16px; font-weight: bold; cursor: pointer; }
</style></head>
<body>
  <h2>Tally Setup</h2>
  <form action="/save" method="POST">
    <input type="text" name="ssid" placeholder="WLAN Name (SSID)" required><br>
    <input type="password" name="password" placeholder="Passwort" required><br>
    <button type="submit">Speichern & Neustarten</button>
  </form>
</body></html>
)HTML";

ConfigPortal::ConfigPortal(StorageHandler& storage)
    : storage_(storage), web_server_(80) {}

void ConfigPortal::Start() {
  if (is_running_) return;

  Serial.println("[PORTAL] Starte Access Point...");
  WiFi.mode(WIFI_AP);
  // Das ist der Name des WLANs, das dein Tally aufspannt!
  WiFi.softAP("Kanito-Tally-Setup");

  // Der Standard-IP-Bereich eines ESP32 APs ist 192.168.4.1
  // Starte den DNS Server. Er leitet JEDE Domain (z.B. google.com) auf den
  // ESP32 um (Captive Portal)
  dns_server_.start(53, "*", WiFi.softAPIP());

  SetupRoutes();
  web_server_.begin();

  is_running_ = true;
  is_finished_ = false;
  Serial.println("[PORTAL] Webserver und DNS laufen.");
}

void ConfigPortal::Stop() {
  if (!is_running_) return;

  web_server_.end();
  dns_server_.stop();
  WiFi.softAPdisconnect(true);
  is_running_ = false;
  Serial.println("[PORTAL] Beendet.");
}

void ConfigPortal::Update() {
  if (is_running_) {
    // Verarbeitet die DNS-Anfragen für das Captive Portal
    dns_server_.processNextRequest();
  }
}

bool ConfigPortal::IsFinished() const { return is_finished_; }

void ConfigPortal::SetupRoutes() {
  // 1. Die Hauptseite ausliefern
  web_server_.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send(200, "text/html", kHtmlForm);
  });

  // 2. Das Absenden des Formulars verarbeiten
  web_server_.on("/save", HTTP_POST, [this](AsyncWebServerRequest* request) {
    String ssid = "";
    String pass = "";

    if (request->hasParam("ssid", true)) {
      ssid = request->getParam("ssid", true)->value();
    }
    if (request->hasParam("password", true)) {
      pass = request->getParam("password", true)->value();
    }

    if (ssid.length() > 0) {
      // Speichere die Daten im NVS Flash (über unseren StorageHandler!)
      this->storage_.SaveWifiConfig(ssid.c_str(), pass.c_str());

      request->send(200, "text/html",
                    "<h2>Gespeichert! Tally startet neu...</h2>");

      // Setze das Flag, damit der Core weiß, dass wir fertig sind
      this->is_finished_ = true;
    } else {
      request->send(400, "text/plain", "Fehler: SSID fehlt.");
    }
  });

  // 3. Captive Portal Catch-All: Wenn das Handy im Hintergrund testet,
  // ob Internet da ist, leiten wir es auf unsere Startseite um.
  web_server_.onNotFound(
      [](AsyncWebServerRequest* request) { request->redirect("/"); });
}