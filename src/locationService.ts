import { store } from "./store";

import type { LocationRecord } from "./indexeddb";
import { database } from "./indexeddb";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

class LocationService {
  private lastLocationTime: number = 0;

  private readonly LOCATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

  private watchId: number | null = null;

  private isTracking = false;

  async startLocationTracking(): Promise<void> {
    if (this.isTracking) {
      console.log("Location tracking already started");
      return;
    }

    // Location tracking is now handled by content script
    // This method is kept for compatibility but does nothing
    console.log("Location tracking is handled by content script");
    this.isTracking = true;
  }

  // Handle location updates from content script
  handleLocationUpdate(location: { latitude: number; longitude: number; timestamp: number }): void {
    const locationData: LocationData = {
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date(location.timestamp).toISOString(),
    };

    this.handleLocationSuccess({
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: 0,
      },
      timestamp: location.timestamp,
    } as GeolocationPosition);
  }

  stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.isTracking = false;
    console.log("Location tracking stopped");
  }

  async getCurrentLocation(): Promise<LocationData | null> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not available"));

        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString(),
          };
          resolve(locationData);
        },
        (error) => {
          console.error("Error getting current location:", error);
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000, // 1 minute
        },
      );
    });
  }

  private async handleLocationSuccess(
    position: GeolocationPosition,
  ): Promise<void> {
    try {
      const now = Date.now();

      // Only record location if enough time has passed since last record
      if (now - this.lastLocationTime < this.LOCATION_INTERVAL) {
        return;
      }

      const locationRecord: LocationRecord = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
        synced: false,
      };

      // Store in local database
      await database.insertLocationRecord(locationRecord);
      this.lastLocationTime = now;

      console.log("Location recorded:", locationRecord);

      // Attempt to sync with server
      await this.syncLocationData();
    } catch (error) {
      console.error("Error handling location success:", error);
    }
  }

  private handleLocationError(error: GeolocationPositionError): void {
    let errorMessage = "Unknown location error";

    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = "Location access denied by user";
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = "Location information unavailable";
        break;
      case error.TIMEOUT:
        errorMessage = "Location request timed out";
        break;
    }

    console.warn("Location error:", errorMessage, error);
  }

  async recordLocationManually(
    latitude: number,
    longitude: number,
    accuracy?: number,
  ): Promise<void> {
    try {
      const locationRecord: LocationRecord = {
        latitude,
        longitude,
        accuracy,
        timestamp: new Date().toISOString(),
        synced: false,
      };

      await database.insertLocationRecord(locationRecord);
      console.log("Manual location recorded:", locationRecord);

      // Attempt to sync with server
      await this.syncLocationData();
    } catch (error) {
      console.error("Error recording manual location:", error);
    }
  }

  async syncLocationData(): Promise<void> {
    try {
      // Import store to access auth token
      const { accessToken, serverDomain } = store.getState().ciState;

      if (!accessToken) {
        console.log("No access token available, skipping location sync");

        return;
      }

      const unsyncedRecords = await database.getUnsyncedLocationRecords();

      if (unsyncedRecords.length === 0) {
        return;
      }

      console.log(`Syncing ${unsyncedRecords.length} location records...`);

      // Convert to API format
      const locationEvents = unsyncedRecords.map((record) => ({
        name: `Location Update`,
        start_time: record.timestamp,
        type: "Location",
        location: {
          latitude: record.latitude,
          longitude: record.longitude,
          accuracy: record.accuracy,
        },
      }));

      // Send to CI-Server API (similar to existing event posting)
      const axios = (await import("axios")).default;

      try {
        await axios.post(`https://${serverDomain}/api/places`, locationEvents, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        // Mark records as synced
        for (const record of unsyncedRecords) {
          if (record.id) {
            await database.markLocationRecordAsSynced(record.id);
          }
        }

        console.log(
          `Successfully synced ${unsyncedRecords.length} location records`,
        );
      } catch (apiError) {
        console.error("Failed to sync location data with API:", apiError);
      }
    } catch (error) {
      console.error("Error in syncLocationData:", error);
    }
  }

  async getLocationHistory(limit: number = 50): Promise<LocationRecord[]> {
    return database.getAllLocationRecords(limit);
  }

  isLocationTrackingActive(): boolean {
    return this.isTracking;
  }
}

// Create singleton instance
export const locationService = new LocationService();
