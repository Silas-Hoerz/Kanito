import socket
import threading
import time
import csv
import os
from flask import Flask, render_template_string, jsonify, request
import protocol_pb2

# pip install flask protobuf
# python .\test_hub.py

app = Flask(__name__)

# --- KONFIGURATION ---
ESP_IP = "192.168.178.169" 
UDP_PORT = 4444

# Globaler Speicher für die Telemetrie des Tallys
tally_status = {
    "state": "OFFLINE",
    "battery": 0,
    "voltage": 0.0,
    "charge_state": "UNKNOWN",
    "rssi": 0,
    "uptime": 0,
    "last_seen": "Nie",
    "is_profiling": False
}

profiling_filename = None

# --- UDP NETZWERK LOGIK ---
send_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def log_telemetry_to_csv():
    """Schreibt die aktuellen Akku-Daten in die CSV-Datei."""
    global profiling_filename
    if not profiling_filename:
        return
    
    try:
        with open(profiling_filename, mode='a', newline='') as f:
            writer = csv.writer(f)
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([
                timestamp, 
                tally_status["battery"], 
                round(tally_status["voltage"], 2), 
                tally_status["charge_state"]
            ])
    except Exception as e:
        print(f"[CSV Error] Konnte nicht in CSV schreiben: {e}")

def udp_listener_thread():
    """Hört im Hintergrund auf eingehende Telemetrie-Pakete vom Tally."""
    recv_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    recv_sock.bind(('', UDP_PORT)) 
    
    print(f"[UDP] Lausche auf Telemetrie auf Port {UDP_PORT}...")
    
    # Mapping für den Ladezustand
    charge_state_map = {
        protocol_pb2.CHARGE_STATE_UNSPECIFIED: "UNKNOWN",
        protocol_pb2.CHARGE_STATE_DISCHARGING: "DISCHARGING",
        protocol_pb2.CHARGE_STATE_CHARGING: "CHARGING",
        protocol_pb2.CHARGE_STATE_FULL: "FULL"
    }

    state_map = {
        protocol_pb2.STATE_UNSPECIFIED: "UNKNOWN",
        protocol_pb2.STATE_BOOT: "BOOTING",
        protocol_pb2.STATE_STANDBY: "STANDBY",
        protocol_pb2.STATE_PREVIEW: "PREVIEW",
        protocol_pb2.STATE_LIVE: "LIVE",
        protocol_pb2.STATE_CONFIG: "CONFIG",
        protocol_pb2.STATE_SHUTDOWN: "SHUTDOWN",
        protocol_pb2.STATE_ERROR: "ERROR"
    }
    
    while True:
        try:
            data, addr = recv_sock.recvfrom(1024)
            
            msg = protocol_pb2.TallyToHub()
            msg.ParseFromString(data)
            
            # Globale Daten updaten
            tally_status["state"] = state_map.get(msg.current_state, "UNKNOWN")
            
            if msg.HasField("telemetry"):
                tally_status["battery"] = msg.telemetry.battery_percentage
                tally_status["voltage"] = msg.telemetry.battery_voltage
                tally_status["charge_state"] = charge_state_map.get(msg.telemetry.charge_state, "UNKNOWN")
                tally_status["rssi"] = msg.telemetry.rssi
                tally_status["uptime"] = msg.telemetry.uptime_seconds
                tally_status["last_seen"] = time.strftime("%H:%M:%S")
                
                # Wenn die Aufnahme läuft, direkt in die CSV schreiben
                if tally_status["is_profiling"]:
                    log_telemetry_to_csv()
                
        except Exception as e:
            print(f"[UDP Error] {e}")

def send_command(target_state=None, trigger_identify=False):
    """Baut das Protobuf-Paket und sendet es an den ESP32."""
    msg = protocol_pb2.HubToTally()
    msg.message_id = int(time.time()) 
    
    if target_state is not None:
        msg.set_state = target_state
        msg.set_device.master_brightness = 255 
        
    if trigger_identify:
        msg.trigger_identify = True
        
    binary_data = msg.SerializeToString()
    send_sock.sendto(binary_data, (ESP_IP, UDP_PORT))
    print(f"[UDP TX] Befehl an {ESP_IP} gesendet.")


# --- FLASK WEB SERVER (API & UI) ---

@app.route('/api/status')
def api_status():
    return jsonify(tally_status)

@app.route('/api/command', methods=['POST'])
def api_command():
    global profiling_filename
    data = request.json
    action = data.get('action')
    
    if action == 'LIVE':
        send_command(target_state=protocol_pb2.STATE_LIVE)
    elif action == 'PREVIEW':
        send_command(target_state=protocol_pb2.STATE_PREVIEW)
    elif action == 'STANDBY':
        send_command(target_state=protocol_pb2.STATE_STANDBY)
    elif action == 'IDENTIFY':
        send_command(trigger_identify=True)
    elif action == 'START_PROFILE':
        if not tally_status["is_profiling"]:
            profiling_filename = f"battery_profile_{int(time.time())}.csv"
            with open(profiling_filename, mode='w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(["Timestamp", "Percentage(%)", "Voltage(mV)", "ChargeState"])
            tally_status["is_profiling"] = True
            print(f"[\u2705 Profiling] Gestartet! Datei: {profiling_filename}")
    elif action == 'STOP_PROFILE':
        tally_status["is_profiling"] = False
        print("[\u26d4 Profiling] Gestoppt.")
        
    return jsonify({"status": "ok"})

# --- DAS HTML/CSS FRONTEND ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kanito Tally Hub</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #121212; color: #ffffff; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        .dashboard { width: 100%; max-width: 650px; }
        h1 { text-align: center; color: #bb86fc; }
        .card { background-color: #1e1e1e; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .telemetry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .stat-box { background-color: #2c2c2c; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 22px; font-weight: bold; margin-top: 5px; }
        .controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        button { border: none; padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; color: white; transition: opacity 0.2s; }
        button:hover { opacity: 0.8; }
        .btn-live { background-color: #cf6679; }
        .btn-preview { background-color: #03dac6; color: #000; }
        .btn-standby { background-color: #757575; }
        .btn-identify { background-color: #bb86fc; width: 100%; margin-top: 10px; }
        .btn-start { background-color: #f39c12; }
        .btn-stop { background-color: #e74c3c; }
        .state-LIVE { color: #cf6679; }
        .state-PREVIEW { color: #03dac6; }
        .state-STANDBY { color: #aaaaaa; }
        .profiling-active { color: #f39c12; font-weight: bold; }
    </style>
</head>
<body>

<div class="dashboard">
    <h1>Kanito Tally Hub</h1>

    <div class="card">
        <h3>Tally Status: <span id="ui-state" class="stat-value">Lade...</span></h3>
        <div class="telemetry-grid">
            <div class="stat-box">
                <div>Akku</div>
                <div class="stat-value" id="ui-battery">-- %</div>
            </div>
            <div class="stat-box">
                <div>Spannung</div>
                <div class="stat-value" id="ui-voltage">-- mV</div>
            </div>
            <div class="stat-box">
                <div>Ladezustand</div>
                <div class="stat-value" id="ui-chargestate" style="font-size: 18px;">--</div>
            </div>
            <div class="stat-box">
                <div>WLAN (RSSI)</div>
                <div class="stat-value" id="ui-rssi">-- dBm</div>
            </div>
            <div class="stat-box">
                <div>Uptime</div>
                <div class="stat-value" id="ui-uptime">-- s</div>
            </div>
            <div class="stat-box">
                <div>Zuletzt gesehen</div>
                <div class="stat-value" id="ui-lastseen">--</div>
            </div>
        </div>
    </div>

    <div class="card">
        <h3>Akku Vermessung (CSV Logger)</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button class="btn-start" onclick="sendCommand('START_PROFILE')">▶ Messung starten</button>
            <button class="btn-stop" onclick="sendCommand('STOP_PROFILE')">⏹ Messung stoppen</button>
        </div>
        <p id="ui-profiling-status" style="text-align: center; margin-top: 15px;">Status: Inaktiv</p>
    </div>

    <div class="card">
        <h3>Steuerung</h3>
        <div class="controls">
            <button class="btn-live" onclick="sendCommand('LIVE')">LIVE</button>
            <button class="btn-preview" onclick="sendCommand('PREVIEW')">PREVIEW</button>
            <button class="btn-standby" onclick="sendCommand('STANDBY')">STANDBY</button>
        </div>
        <button class="btn-identify" onclick="sendCommand('IDENTIFY')">Tally identifizieren (Blinken)</button>
    </div>
</div>

<script>
    function sendCommand(actionName) {
        fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: actionName })
        });
    }

    setInterval(() => {
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                const stateEl = document.getElementById('ui-state');
                stateEl.innerText = data.state;
                stateEl.className = 'stat-value state-' + data.state;
                
                document.getElementById('ui-battery').innerText = data.battery + ' %';
                document.getElementById('ui-voltage').innerText = Math.round(data.voltage) + ' mV';
                document.getElementById('ui-chargestate').innerText = data.charge_state;
                document.getElementById('ui-rssi').innerText = data.rssi + ' dBm';
                document.getElementById('ui-uptime').innerText = data.uptime + ' s';
                document.getElementById('ui-lastseen').innerText = data.last_seen;

                const profStatus = document.getElementById('ui-profiling-status');
                if (data.is_profiling) {
                    profStatus.innerHTML = "Status: <span class='profiling-active'>🔴 Aufnahme läuft... (schreibt in CSV)</span>";
                } else {
                    profStatus.innerText = "Status: Inaktiv";
                }
            });
    }, 1000);
</script>

</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

if __name__ == '__main__':
    threading.Thread(target=udp_listener_thread, daemon=True).start()
    
    print("\n🚀 Kanito Hub Webserver gestartet!")
    print("👉 Öffne deinen Browser und gehe zu: http://127.0.0.1:5000\n")
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)