# App Review notes — CivicGuard Exercise

Use this text only after the submitted build has passed the verification checklist. Put the developer’s actual private contact details in App Store Connect; none are supplied by this document.

## Purpose and access

CivicGuard Exercise is a complete offline tabletop exercise for practicing wildfire communication. It has no account, subscriptions, advertisements, purchases, backend dependency or restricted features. No login credentials are needed. The interface and help are English; the message workspace contains separately editable English, Spanish and Chinese drafts.

The historical setting is inspired by the January 2025 Palisades fire. Map geometry, exercise checkpoints and care points are illustrative and bundled with the app. There is no live incident feed, device location access, evacuation routing, emergency dispatch, or public-alert delivery. The developer is not an emergency authority.

## Suggested review flow

1. Launch the app with network access disabled. Open **Briefing**, inspect the exercise explanation, and toggle the map layers in **Map**.
2. Open **Draft**, edit the English text, switch to ES and 中文, and edit each draft independently. Choose simulated channels; these buttons do not send anything.
3. Select **Approve Simulation**. This marks the exercise message reviewed without sending it. Edit text or change language/channel choices and observe that review becomes pending again.
4. Wait for **Saved on this device**, close and relaunch the app. The text, selected language and channel choices return. Approval remains pending, requiring a fresh review.
5. Choose **Share exercise summary**. The native system share sheet contains all three drafts and simulated channel choices with a non-removable **SIMULATION ONLY** label added by the app. Canceling the sheet should leave your work intact. Destination availability depends on the review device.
6. Open **About, privacy & support** in Briefing. Its instructions, privacy policy and open-source notices are readable offline. The GitHub support link deliberately opens an external browser and requires a connection.
7. Choose **Reset drafts**, cancel once to preserve your work, then confirm **Reset all drafts**. All three drafts and channel choices return to their original exercise values.

## Data handling

The app saves drafts, selected language and simulated channels in local operating-system preferences. Approval is not saved. Device backups and transfers may include app data according to system settings. There are no automatic external network requests, analytics, advertising or tracking. Sharing only occurs through the user-selected system destination. Support and official-information links are optional external-browser actions.

The app’s privacy manifest declares its use of UserDefaults for local settings. It does not request location, contacts, photos, camera, microphone, notification or tracking permission.

## Reviewer context

This is a training product, not a live emergency app or a temporary demo of a future service. Its core utility is offline map review, persistent multilingual message drafting, explicit review state and a reusable exercise summary. The simulated channels are training choices rather than integrations with WEA, EAS, SMS delivery or social publishing.
