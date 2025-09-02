# Store Publishing Guide

## Prerequisites

1. **Prepare Release**
   ```bash
   npm run prepare:store
   ```
   This will clean, lint, compile, and create ZIP packages for both stores.

2. **Verify Packages**
   - Chrome: `.output/ci-browser-extension-*-chrome.zip`
   - Firefox: `.output/ci-browser-extension-*-firefox.zip`
   - Firefox Sources: `.output/ci-browser-extension-*-sources.zip`

## Chrome Web Store

### Initial Submission

1. **Developer Account**
   - Create a [Chrome Web Store Developer Account](https://chrome.google.com/webstore/devconsole/)
   - Pay one-time $5 registration fee

2. **Upload Extension**
   - Click "New Item"
   - Upload `ci-browser-extension-*-chrome.zip`
   - Fill out store listing details

3. **Store Listing Requirements**
   - **Name**: Companion Intelligence
   - **Summary**: Brief description (132 characters max)
   - **Description**: Detailed description with features
   - **Category**: Choose appropriate category
   - **Icons**: 128x128px icon (included in package)
   - **Screenshots**: At least 1 screenshot (1280x800 or 640x400)
   - **Promotional images**: Optional but recommended

4. **Privacy & Permissions**
   - Review and justify all requested permissions
   - Provide privacy policy if collecting user data
   - Single purpose compliance statement

### Updates

1. Upload new ZIP file
2. Update version number in manifest
3. Add changelog in "What's new" section
4. Submit for review

## Firefox Add-ons (AMO)

### Initial Submission

1. **Developer Account**
   - Create a [Firefox Add-ons Developer Account](https://addons.mozilla.org/developers/)
   - No registration fee

2. **Upload Add-on**
   - Go to "Submit a New Add-on"
   - Upload `ci-browser-extension-*-firefox.zip`
   - Upload `ci-browser-extension-*-sources.zip` (source code required)

3. **Add-on Details**
   - **Name**: Companion Intelligence
   - **Summary**: Brief description
   - **Description**: Detailed description
   - **Categories**: Select appropriate categories
   - **Tags**: Relevant keywords
   - **Icons**: Included in package

4. **Source Code Review**
   - Firefox requires source code for review
   - Include build instructions in sources
   - Explain any minified/compiled code

### Updates

1. Upload new XPI file and sources
2. Increment version number
3. Add version notes
4. Submit for review

## Store Requirements Checklist

### Chrome Web Store
- [ ] Extension follows [Chrome Extension Quality Guidelines](https://developer.chrome.com/docs/webstore/quality_guidelines/)
- [ ] All permissions are justified and minimal
- [ ] Privacy policy provided (if applicable)
- [ ] Screenshots and promotional images ready
- [ ] Single purpose compliance verified

### Firefox Add-ons
- [ ] Extension follows [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [ ] Source code and build instructions included
- [ ] All code is explained and documented
- [ ] No obfuscated or minified code without justification

## Review Process

### Chrome Web Store
- **Timeline**: 1-7 days for new submissions, 24-48 hours for updates
- **Review Focus**: Functionality, privacy, single purpose
- **Common Issues**: Excessive permissions, unclear purpose, policy violations

### Firefox Add-ons
- **Timeline**: 1-10 days depending on complexity
- **Review Focus**: Code quality, security, user experience
- **Common Issues**: Unclear source code, unnecessary permissions, UX problems

## Post-Publishing

### Monitor Performance
- Check extension analytics in developer dashboards
- Monitor user reviews and ratings
- Track installation/usage metrics

### User Support
- Respond to user reviews
- Provide support documentation
- Handle bug reports and feature requests

### Updates and Maintenance
- Regular security updates
- Browser API compatibility updates
- Feature improvements based on user feedback

## Automation

The repository includes GitHub Actions workflows:
- **CI/CD**: Automatic builds on push/PR
- **Release**: Automatic package creation on git tags
- Tag releases like `v1.0.0` to trigger automated release builds