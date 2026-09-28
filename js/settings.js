// PrintOkiyo Admin - Store Operation Settings

async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/settings`);
    if (!res.ok) throw new Error("Could not load settings");
    const settings = await res.json();
    inputSettingsThreshold.value = settings.delivery_charge_threshold;
    inputSettingsCharge.value = settings.delivery_charge;
    if (inputSettingsCodFee) inputSettingsCodFee.value = settings.cod_fee !== undefined ? settings.cod_fee : 40;
    inputSettingsCod.checked = settings.cod_enabled;
  } catch (err) {
    console.error("Error loading store settings:", err);
    showToast("Error loading store configurations.");
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const threshold = parseFloat(inputSettingsThreshold.value);
  const charge = parseFloat(inputSettingsCharge.value);
  const codFee = inputSettingsCodFee ? parseFloat(inputSettingsCodFee.value) : 40.0;
  const codEnabled = inputSettingsCod.checked;

  try {
    const res = await fetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        delivery_charge_threshold: threshold,
        delivery_charge: charge,
        cod_fee: codFee,
        cod_enabled: codEnabled
      })
    });

    if (!res.ok) throw new Error("Could not update settings");
    const updated = await res.json();
    showToast("Store configurations updated!");
    
    inputSettingsThreshold.value = updated.delivery_charge_threshold;
    inputSettingsCharge.value = updated.delivery_charge;
    if (inputSettingsCodFee) inputSettingsCodFee.value = updated.cod_fee !== undefined ? updated.cod_fee : 40;
    inputSettingsCod.checked = updated.cod_enabled;
  } catch (err) {
    console.error("Error saving configurations:", err);
    showToast("Error saving configurations.");
  }
}
