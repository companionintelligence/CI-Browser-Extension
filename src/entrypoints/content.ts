export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Content script for capturing form submissions
    // This script runs on all pages to capture form submission events

    // Listen for form submissions
    document.addEventListener('submit', async (event) => {
  try {
    const form = event.target as HTMLFormElement;
    if (!form) return;

    // Get form data
    const formData = new FormData(form);
    const fields: Record<string, string> = {};
    
    // Extract form fields (excluding sensitive data like passwords)
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string' && !key.toLowerCase().includes('password')) {
        fields[key] = value;
      }
    }

    // Create form submission data
    const submissionData = {
      id: `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: window.location.href,
      domain: window.location.hostname,
      fields: fields,
      timestamp: new Date().toISOString(),
    };

    // Store form submission locally
    const existingSubmissions = await browser.storage.local.get('formSubmissions');
    const submissions = existingSubmissions.formSubmissions || [];
    submissions.push(submissionData);

    // Keep only last 1000 form submissions to prevent storage bloat
    if (submissions.length > 1000) {
      submissions.splice(0, submissions.length - 1000);
    }

    await browser.storage.local.set({
      formSubmissions: submissions
    });

    // Send message to background script if form sync is enabled
    try {
      await browser.runtime.sendMessage({
        action: 'formSubmitted',
        data: submissionData
      });
    } catch (error) {
      // Ignore errors - background script might not be ready
    }
  } catch (error) {
    console.error('Error capturing form submission:', error);
  }
});

// Also listen for AJAX form submissions
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const result = await originalFetch.apply(this, args);
  
  // Check if this might be a form submission
  if (args[1] && args[1].method && ['POST', 'PUT', 'PATCH'].includes(args[1].method)) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      const submissionData = {
        id: `ajax_form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: url,
        domain: new URL(url).hostname,
        fields: {},
        timestamp: new Date().toISOString(),
        type: 'ajax'
      };

      // Store AJAX form submission
      const existingSubmissions = await browser.storage.local.get('formSubmissions');
      const submissions = existingSubmissions.formSubmissions || [];
      submissions.push(submissionData);

      if (submissions.length > 1000) {
        submissions.splice(0, submissions.length - 1000);
      }

      await browser.storage.local.set({
        formSubmissions: submissions
      });
    } catch (error) {
      console.error('Error capturing AJAX form submission:', error);
    }
  }
  
  return result;
};
  },
});