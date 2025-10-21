export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Geolocation tracking in content script
    // This runs on web pages where geolocation APIs are available

    let watchId: number | null = null;
    let lastLocation: { latitude: number; longitude: number; timestamp: number } | null = null;

    // Function to get current location
    async function getCurrentLocation(): Promise<{ latitude: number; longitude: number; timestamp: number } | null> {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          console.log('Geolocation not supported');
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: Date.now()
            };
            resolve(location);
          },
          (error) => {
            console.log('Geolocation error:', error.message);
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
          }
        );
      });
    }

    // Function to start watching location
    function startLocationTracking() {
      if (!navigator.geolocation || watchId !== null) {
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: Date.now()
          };
          
          lastLocation = location;
          
          // Send location to background script
          browser.runtime.sendMessage({
            action: 'locationUpdate',
            location: location
          }).catch(error => {
            console.log('Error sending location to background:', error);
          });
        },
        (error) => {
          console.log('Geolocation watch error:', error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000 // 1 minute
        }
      );
    }

    // Function to stop watching location
    function stopLocationTracking() {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    }

    // Function to sync location data
    async function syncLocationData() {
      if (!lastLocation) {
        const currentLocation = await getCurrentLocation();
        if (currentLocation) {
          lastLocation = currentLocation;
        }
      }

      if (lastLocation) {
        // Send location to background script for syncing
        browser.runtime.sendMessage({
          action: 'syncLocation',
          location: lastLocation
        }).catch(error => {
          console.log('Error syncing location:', error);
        });
      }
    }

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'startLocationTracking') {
        startLocationTracking();
        sendResponse({ success: true });
      } else if (message.action === 'stopLocationTracking') {
        stopLocationTracking();
        sendResponse({ success: true });
      } else if (message.action === 'getCurrentLocation') {
        getCurrentLocation().then(location => {
          sendResponse({ location });
        });
        return true; // Keep message channel open for async response
      } else if (message.action === 'syncLocationData') {
        syncLocationData().then(() => {
          sendResponse({ success: true });
        });
        return true; // Keep message channel open for async response
      }
    });

    // Auto-start location tracking when page loads
    // Only start if user has granted permission
    if (navigator.geolocation) {
      // Check if we already have permission by trying to get current position
      navigator.geolocation.getCurrentPosition(
        () => {
          // Permission granted, start tracking
          startLocationTracking();
        },
        () => {
          // Permission denied or error, don't start tracking
          console.log('Geolocation permission not granted');
        },
        { timeout: 1000 }
      );
    }
  },
});
