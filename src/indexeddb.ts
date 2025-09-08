export interface SurfingRecord {
  id?: number;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  visitTime: string;
  duration?: number;
  synced: boolean;
}

export interface LocationRecord {
  id?: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  synced: boolean;
}

class Database {
  private db: IDBDatabase | null = null;

  private dbName = "CIBrowserExtensionDB";

  private version = 1;

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error("Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("Database initialized successfully");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;

        // Create surfing_records table
        if (!this.db.objectStoreNames.contains("surfing_records")) {
          const surfingStore = this.db.createObjectStore("surfing_records", {
            keyPath: "id",
            autoIncrement: true,
          });
          surfingStore.createIndex("synced", "synced", { unique: false });
          surfingStore.createIndex("visitTime", "visitTime", { unique: false });
        }

        // Create location_records table
        if (!this.db.objectStoreNames.contains("location_records")) {
          const locationStore = this.db.createObjectStore("location_records", {
            keyPath: "id",
            autoIncrement: true,
          });
          locationStore.createIndex("synced", "synced", { unique: false });
          locationStore.createIndex("timestamp", "timestamp", {
            unique: false,
          });
        }
      };
    });
  }

  async insertSurfingRecord(record: SurfingRecord): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["surfing_records"],
        "readwrite",
      );
      const store = transaction.objectStore("surfing_records");

      const request = store.add({
        ...record,
        createdAt: new Date().toISOString(),
      });

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async insertLocationRecord(record: LocationRecord): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["location_records"],
        "readwrite",
      );
      const store = transaction.objectStore("location_records");

      const request = store.add({
        ...record,
        createdAt: new Date().toISOString(),
      });

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getUnsyncedSurfingRecords(): Promise<SurfingRecord[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["surfing_records"], "readonly");
      const store = transaction.objectStore("surfing_records");
      const index = store.index("synced");

      const request = index.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getUnsyncedLocationRecords(): Promise<LocationRecord[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["location_records"],
        "readonly",
      );
      const store = transaction.objectStore("location_records");
      const index = store.index("synced");

      const request = index.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async markSurfingRecordAsSynced(id: number): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["surfing_records"],
        "readwrite",
      );
      const store = transaction.objectStore("surfing_records");

      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.synced = true;
          const updateRequest = store.put(record);

          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    });
  }

  async markLocationRecordAsSynced(id: number): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["location_records"],
        "readwrite",
      );
      const store = transaction.objectStore("location_records");

      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.synced = true;
          const updateRequest = store.put(record);

          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    });
  }

  async getAllSurfingRecords(limit: number = 100): Promise<SurfingRecord[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["surfing_records"], "readonly");
      const store = transaction.objectStore("surfing_records");

      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result.slice(-limit);
        resolve(results);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getAllLocationRecords(limit: number = 100): Promise<LocationRecord[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["location_records"],
        "readonly",
      );
      const store = transaction.objectStore("location_records");

      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result.slice(-limit);
        resolve(results);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clearDatabase(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["surfing_records", "location_records"],
        "readwrite",
      );

      const surfingStore = transaction.objectStore("surfing_records");
      const locationStore = transaction.objectStore("location_records");

      const clearSurfing = surfingStore.clear();
      const clearLocation = locationStore.clear();

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 2) {
          resolve();
        }
      };

      clearSurfing.onsuccess = checkComplete;
      clearLocation.onsuccess = checkComplete;

      clearSurfing.onerror = () => reject(clearSurfing.error);
      clearLocation.onerror = () => reject(clearLocation.error);
    });
  }

  async getStats(): Promise<{
    surfingCount: number;
    locationCount: number;
    unsyncedSurfing: number;
    unsyncedLocation: number;
  }> {
    await this.init();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(
        ["surfing_records", "location_records"],
        "readonly",
      );

      const surfingStore = transaction.objectStore("surfing_records");
      const locationStore = transaction.objectStore("location_records");

      const stats = {
        surfingCount: 0,
        locationCount: 0,
        unsyncedSurfing: 0,
        unsyncedLocation: 0,
      };

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 4) {
          resolve(stats);
        }
      };

      surfingStore.count().onsuccess = (e) => {
        stats.surfingCount = (e.target as IDBRequest).result;
        checkComplete();
      };

      locationStore.count().onsuccess = (e) => {
        stats.locationCount = (e.target as IDBRequest).result;
        checkComplete();
      };

      surfingStore.index("synced").count().onsuccess = (e) => {
        stats.unsyncedSurfing = (e.target as IDBRequest).result;
        checkComplete();
      };

      locationStore.index("synced").count().onsuccess = (e) => {
        stats.unsyncedLocation = (e.target as IDBRequest).result;
        checkComplete();
      };
    });
  }
}

// Create a singleton instance
export const database = new Database();
