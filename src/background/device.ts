/**
 * Device registration + last_seen heartbeat. See planning/10-device-service.md.
 *
 * Tiered matching: stored device_id (exact) → fingerprint (device_type=browser,
 * platform=web, name OR model match). Server's `ensureDeviceExists` keys on
 * `device_type` and `platform` so they're pinned here.
 */

import axios from "axios";
import bowser from "bowser";
import { jwtDecode } from "jwt-decode";
import { logger, errMessage } from "@/lib/log";
import { store } from "@/store";
import { setState } from "@/store/ciStateSlice";

const REQUEST_TIMEOUT_MS = 10_000;
const LAST_SEEN_TIMEOUT_MS = 5_000;

let deviceSetupInProgress = false;

function isAccessTokenValid(accessToken: string | null | undefined): boolean {
  if (!accessToken) {
    return false;
  }

  try {
    const decoded = jwtDecode<{ exp?: number }>(accessToken);
    if (!decoded?.exp) {
      return false;
    }

    return Date.now() < decoded.exp * 1000;
  } catch {
    return false;
  }
}

export function getDeviceInfo() {
  const browser_info = bowser.getParser(navigator.userAgent);
  const osName = browser_info.getOSName() || "unknown";
  const browserName = browser_info.getBrowserName() || "Chrome";
  const browserVersion = browser_info.getBrowserVersion() || undefined;
  const osVersion = browser_info.getOSVersion() || undefined;

  const platformType = browser_info.getPlatformType();
  const formFactor =
    platformType === "mobile"
      ? "mobile"
      : platformType === "tablet"
        ? "tablet"
        : "desktop";

  const device_name = `${browserName} on ${osName}`;
  const model = osVersion ? `${osName} ${osVersion}` : osName;

  const lower = osName.toLowerCase();
  let manufacturer: string | undefined;
  if (lower.includes("mac") || lower.includes("ios")) {
    manufacturer = "Apple";
  } else if (lower.includes("windows")) {
    manufacturer = "Microsoft";
  } else if (lower.includes("android")) {
    manufacturer = "Google";
  } else if (lower.includes("linux")) {
    manufacturer = "Linux Foundation";
  }

  return {
    device_name,
    device_type: "browser" as const,
    platform: "web" as const,
    model,
    manufacturer,
    os_version: osVersion,
    app_version: browserVersion,
    form_factor: formFactor,
  };
}

export async function getDeviceId(): Promise<string> {
  const storage = await browser.storage.local.get("deviceId");
  if (typeof storage.deviceId === "string" && storage.deviceId.length > 0) {
    return storage.deviceId;
  }

  throw new Error(
    "No device_id found. Please wait for device setup to complete.",
  );
}

export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  try {
    const { accessToken, serverDomain } = store.getState().ciState;
    if (!accessToken || !serverDomain || !isAccessTokenValid(accessToken)) {
      return;
    }

    await axios.patch(
      `https://${serverDomain}/api/devices/${deviceId}/last-seen`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: LAST_SEEN_TIMEOUT_MS,
      },
    );
    logger.debug("device.lastSeen.updated", { deviceId });
  } catch (err) {
    logger.debug("device.lastSeen.failed", { deviceId, err: errMessage(err) });
  }
}

export async function fetchDeviceFromServer(): Promise<string | null> {
  try {
    const { accessToken, serverDomain } = store.getState().ciState;
    if (!accessToken || !isAccessTokenValid(accessToken)) {
      return null;
    }

    const response = await axios.get(`https://${serverDomain}/api/devices`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const devices = response.data as Array<{
      device_id: string;
      device_name: string;
      device_type: string;
      platform: string;
      model?: string;
    }>;

    const storage = await browser.storage.local.get("deviceId");
    const storedDeviceId =
      typeof storage.deviceId === "string" ? storage.deviceId : undefined;
    if (storedDeviceId) {
      const exact = devices.find((d) => d.device_id === storedDeviceId);
      if (exact) {
        return storedDeviceId;
      }
    }

    const info = getDeviceInfo();
    const fingerprint = devices.find(
      (d) =>
        d.device_type === "browser" &&
        d.platform === "web" &&
        (d.device_name === info.device_name ||
          (info.model && d.model === info.model)),
    );
    if (fingerprint) {
      await browser.storage.local.set({
        deviceId: fingerprint.device_id,
        deviceName: fingerprint.device_name,
        deviceType: fingerprint.device_type,
        devicePlatform: fingerprint.platform,
      });
      store.dispatch(
        setState({
          deviceId: fingerprint.device_id,
          deviceName: fingerprint.device_name,
          deviceType: fingerprint.device_type,
          devicePlatform: fingerprint.platform,
        }),
      );
      logger.info("device.resolved", {
        strategy: "fingerprint",
        deviceId: fingerprint.device_id,
      });

      return fingerprint.device_id;
    }

    return null;
  } catch (err) {
    logger.warn("device.fetchFailed", { err: errMessage(err) });

    return null;
  }
}

export async function createDeviceOnServer(): Promise<string> {
  const { accessToken, serverDomain } = store.getState().ciState;
  if (!accessToken) {
    throw new Error("Cannot create device: No access token available");
  }

  if (!isAccessTokenValid(accessToken)) {
    throw new Error(
      "Cannot create device: Access token expired. Please log in again.",
    );
  }

  const deviceInfo = getDeviceInfo();
  try {
    const response = await axios.post(
      `https://${serverDomain}/api/devices`,
      deviceInfo,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const deviceId = response.data.device_id;
    const deviceName = response.data.device_name;
    const deviceType = response.data.device_type;
    const devicePlatform = response.data.platform;

    await browser.storage.local.set({
      deviceId,
      deviceName,
      deviceType,
      devicePlatform,
    });
    store.dispatch(
      setState({ deviceId, deviceName, deviceType, devicePlatform }),
    );

    logger.info("device.resolved", { strategy: "created", deviceId });
    deviceSetupInProgress = false;

    return deviceId;
  } catch (err: unknown) {
    const errorMessage =
      (err as { response?: { data?: { message?: string; error?: string } } })
        ?.response?.data?.message ??
      (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error ??
      errMessage(err);
    throw new Error(`Failed to create device: ${errorMessage}`);
  }
}

export async function setupDevice(): Promise<string> {
  if (deviceSetupInProgress) {
    throw new Error("Device setup already in progress");
  }

  deviceSetupInProgress = true;
  try {
    const { accessToken } = store.getState().ciState;
    if (!accessToken) {
      throw new Error("No access token available. Please log in first.");
    }

    const existing = await fetchDeviceFromServer();
    if (existing) {
      return existing;
    }

    return await createDeviceOnServer();
  } catch (err) {
    deviceSetupInProgress = false;
    throw new Error(errMessage(err));
  }
}
