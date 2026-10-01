import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import os

# --- 1. CONFIGURATION ---
INPUT_FILE = 'battery_profile_1772717978.csv'          # Name of your raw CSV file
EXPORT_FILE = 'compact_data.csv'      # Name of the reduced export CSV
TARGET_POINTS = 200                   # Target number of data points for the CSV EXPORT
UPDATE_INTERVAL_MS = 5000             # Check for file updates every 5000ms (5 seconds)

# Enable Dark Mode for all plots
plt.style.use('dark_background')

# Global variable to track file changes
last_modified_time = 0

# Setup the live dashboard figure
fig, (ax_voltage, ax_percentage) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)
fig.canvas.manager.set_window_title('Live Battery Analysis')

def save_individual_plots(df_full):
    """Saves individual high-res plots silently in the background for publishing."""
    
    # 1. Save Voltage Plot
    fig_v, ax_v = plt.subplots(figsize=(8, 5))
    ax_v.plot(df_full['Time_rel_min'], df_full['Voltage(mV)'], linestyle='-', linewidth=1.5, color='cyan')
    ax_v.set_title('Battery Curve - Voltage')
    ax_v.set_xlabel('Time since start (minutes)')
    ax_v.set_ylabel('Voltage (mV)')
    ax_v.grid(True, alpha=0.3)
    fig_v.tight_layout()
    fig_v.savefig('plot_export_voltage.png', dpi=300)
    plt.close(fig_v) # Close to free up memory

    # 2. Save Percentage Plot
    fig_p, ax_p = plt.subplots(figsize=(8, 5))
    ax_p.plot(df_full['Time_rel_min'], df_full['Percentage(%)'], linestyle='-', linewidth=1.5, color='lime')
    ax_p.set_title('Battery Curve - Charge Level')
    ax_p.set_xlabel('Time since start (minutes)')
    ax_p.set_ylabel('Charge (%)')
    ax_p.set_ylim(0, 105)
    ax_p.grid(True, alpha=0.3)
    fig_p.tight_layout()
    fig_p.savefig('plot_export_percentage.png', dpi=300)
    plt.close(fig_p)

def update(frame):
    global last_modified_time

    # Check if file exists
    if not os.path.exists(INPUT_FILE):
        print(f"Waiting for file '{INPUT_FILE}' to be created...")
        return

    # Check if file was modified since last read to save CPU power
    current_modified_time = os.path.getmtime(INPUT_FILE)
    if current_modified_time == last_modified_time:
        return # No new data, skip update
    
    last_modified_time = current_modified_time
    print("\nFile update detected. Processing new data...")

    # Read data
    try:
        df = pd.read_csv(INPUT_FILE, parse_dates=['Timestamp'])
    except Exception as e:
        print(f"Could not read file (might be locked by another process): {e}")
        return

    # Filter for both DISCHARGING and CHARGING to keep the plot running
    df_plot = df[df['ChargeState'].isin(['DISCHARGING', 'CHARGING'])].copy()
    if df_plot.empty:
        print("No valid battery data found yet.")
        return
        
    df_plot.sort_values('Timestamp', inplace=True)
    total_rows = len(df_plot)
    
    # Calculate relative time (minutes) based on the very first timestamp
    start_time = df_plot['Timestamp'].iloc[0]
    df_plot['Time_rel_min'] = (df_plot['Timestamp'] - start_time).dt.total_seconds() / 60.0

    # --- CSV EXPORT (Reduced Data) ---
    step = max(1, total_rows // TARGET_POINTS)
    df_reduced = df_plot.iloc[::step].copy()
    
    print(f"Total rows (plotted): {total_rows} | Reduced for CSV export: {len(df_reduced)}")

    export_columns = ['Time_rel_min', 'Timestamp', 'Percentage(%)', 'Voltage(mV)', 'ChargeState']
    df_reduced[export_columns].to_csv(EXPORT_FILE, index=False)

    # --- PLOTTING (Full Data) ---
    save_individual_plots(df_plot)

    # Update Live Dashboard
    ax_voltage.clear()
    ax_percentage.clear()

    # Redraw Voltage
    ax_voltage.plot(df_plot['Time_rel_min'], df_plot['Voltage(mV)'], linestyle='-', linewidth=1.5, color='cyan')
    ax_voltage.set_title('Live Voltage')
    ax_voltage.set_ylabel('Voltage (mV)')
    ax_voltage.grid(True, alpha=0.3)

    # Redraw Percentage
    ax_percentage.plot(df_plot['Time_rel_min'], df_plot['Percentage(%)'], linestyle='-', linewidth=1.5, color='lime')
    ax_percentage.set_title('Live Charge Level')
    ax_percentage.set_xlabel('Time (minutes)')
    ax_percentage.set_ylabel('Charge (%)')
    ax_percentage.set_ylim(0, 105)
    ax_percentage.grid(True, alpha=0.3)

    plt.tight_layout()

def main():
    print(f"Starting Live-Monitor for '{INPUT_FILE}'...")
    print("Close the plot window to stop the script.")
    
    ani = FuncAnimation(fig, update, interval=UPDATE_INTERVAL_MS, cache_frame_data=False)
    plt.show()

if __name__ == '__main__':
    main()