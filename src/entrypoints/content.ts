import bowser from "bowser";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Detect mobile environment
    const browser_info = bowser.getParser(window.navigator.userAgent);
    const isMobile = browser_info.getPlatformType() === "mobile";
    const browserName = browser_info.getBrowserName();


    // Scroll depth tracking
    let maxScrollDepth = 0;
    let scrollDepthPercentage = 0;
    
    // Function to calculate scroll depth
    const calculateScrollDepth = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercentage = documentHeight > 0 ? Math.round((scrollTop / documentHeight) * 100) : 0;
      
      if (scrollPercentage > maxScrollDepth) {
        maxScrollDepth = scrollPercentage;
        scrollDepthPercentage = maxScrollDepth;
      }
    };
    
    // Track scroll events
    let scrollTimeout: number;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(calculateScrollDepth, 100); // Debounce scroll events
    });
    
    // Calculate initial scroll depth
    calculateScrollDepth();

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getMetaDescription') {
        try {
          // Get meta description from the page
          const metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
          const description = metaDescription ? metaDescription.content : undefined;
          
          sendResponse({ description: description });
        } catch (error) {
          console.error("Error getting meta description:", error);
          sendResponse({ description: undefined });
        }
        return true; // Keep message channel open for async response
      }
      
      if (message.action === 'getScrollDepth') {
        try {
          // Calculate current scroll depth
          calculateScrollDepth();
          sendResponse({ scrollDepth: scrollDepthPercentage });
        } catch (error) {
          console.error("Error getting scroll depth:", error);
          sendResponse({ scrollDepth: 0 });
        }
        return true; // Keep message channel open for async response
      }
    });
  },
});
