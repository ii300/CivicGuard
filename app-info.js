(function (root) {
    "use strict";

    const SUPPORT_URL = "https://github.com/ii300/CivicGuard/issues";
    const LEAFLET_LICENSE = `BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

    const CAPACITOR_LICENSE = `MIT License

Copyright (c) 2017-present Drifty Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

    const CAPACITOR_PLUGINS_LICENSE = `Copyright 2020-present Ionic
https://ionic.io

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

    function mount(target, options = {}) {
        if (!target || target.dataset.civicguardInfoMounted === "true") return target;
        const document = target.ownerDocument;
        const packaged = options.packaged ?? Boolean(document.querySelector(
            'meta[name="civicguard-distribution"][content="packaged"]',
        ));
        function element(tag, text, parent) {
            const node = document.createElement(tag);
            if (text) node.textContent = text;
            if (parent) parent.appendChild(node);
            return node;
        }
        function disclosure(label, parent) {
            const details = element("details", "", parent);
            element("summary", label, details);
            return details;
        }
        const details = disclosure("About, privacy & support", target);
        element("h3", "CivicGuard Exercise", details);
        element("p", "An offline tabletop exercise for practicing wildfire message review in English, Spanish and Chinese. The historical setting is inspired by January 2025; zones, checkpoints and care points are illustrative exercises.", details);
        element("p", "Exercise only. Do not use this app for emergency decisions, evacuation routes or current incident information. It is not affiliated with an emergency authority and cannot send public alerts.", details);
        const steps = element("ol", "", details);
        [
            "Inspect the exercise map and its layer descriptions.",
            "Edit each language separately and choose simulated channels. These choices do not send a message.",
            "Choose Approve Simulation after checking the wording. Any edit, language or channel change requires a fresh review; this action never sends an alert.",
            "Share an exercise summary when you want to discuss your work. Review all three drafts before sharing; each summary is labeled SIMULATION ONLY.",
            "Wait for “Saved on this device” before closing. Reset drafts clears your saved edits after confirmation.",
        ].forEach((step) => element("li", step, steps));

        const privacy = disclosure("Privacy policy", details);
        privacy.id = "appPrivacyPolicy";
        element("p", "Effective 19 October 2026. This policy describes the packaged CivicGuard Exercise app. The developer does not automatically receive or store your exercise drafts.", privacy);
        element("h4", "Data on your device", privacy);
        element("p", "The app saves your three language drafts, selected language and simulated channel choices on this device. Native iOS and Android apps use operating-system preferences; the browser and desktop versions use local web storage. Review approval is not stored. Avoid entering sensitive personal information.", privacy);
        element("p", "Saved edits remain until you reset drafts, clear app/browser data or remove the app. Device backups or transfers may include app data according to your operating-system settings. CivicGuard does not operate a cloud sync or backup service. Clearing this app cannot delete copies already in a system backup or files you have exported.", privacy);
        element("h4", "Network and sharing", privacy);
        element("p", packaged
            ? "This packaged app includes its exercise data, map and interface. It makes no automatic external network requests and includes no advertising, analytics or tracking. It does not request your location, contacts, photos, camera or microphone."
            : "You are viewing the development website. It can request Leaflet files from unpkg and map images and public data from Esri/ArcGIS; those services receive normal request information such as IP address, browser information and the displayed map area. This development website has different network behavior from the offline packaged app.", privacy);
        element("p", "Sharing is optional and starts only when you select Share exercise summary. The summary includes all three drafts and selected channels. Your operating system and chosen destination handle the transfer under their own privacy practices. CivicGuard does not upload a copy to its own server. A saved or shared copy stays under your control at the destination.", privacy);
        element("p", "Opening an external support or official-information link uses your browser and requires a network connection. That website handles its own request information. Submitting a GitHub issue makes what you write public; do not post personal details or sensitive drafts.", privacy);
        element("h4", "Delete data and contact", privacy);
        element("p", "Use Reset drafts, then Reset all drafts, to remove saved exercise edits on this device and restore the original exercise text. Delete exported copies in the app or service where you saved them. For privacy or support questions, contact the maintainer through the support link below.", privacy);

        element("h4", "Support", details);
        element("p", "Contact the CivicGuard maintainer or report a problem on GitHub. Include the app version, device and steps to reproduce. A GitHub account may be required to submit an issue. This is a public support channel, not an emergency service.", details);
        const support = element("a", "Contact support on GitHub (opens browser)", details);
        support.href = SUPPORT_URL;
        support.target = "_blank";
        support.rel = "noreferrer noopener";

        const acknowledgements = disclosure("Open-source acknowledgements", details);
        [
            ["Leaflet — BSD 2-Clause", LEAFLET_LICENSE],
            ["Capacitor — MIT", CAPACITOR_LICENSE],
            ["Capacitor Preferences and Share plugins — MIT", CAPACITOR_PLUGINS_LICENSE],
        ].forEach(([name, license]) => {
            const notice = disclosure(name, acknowledgements);
            const pre = element("pre", license, notice);
            pre.style.whiteSpace = "pre-wrap";
            pre.style.overflowWrap = "anywhere";
        });
        target.dataset.civicguardInfoMounted = "true";
        return target;
    }

    const api = { mount, SUPPORT_URL, LEAFLET_LICENSE, CAPACITOR_LICENSE, CAPACITOR_PLUGINS_LICENSE };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else {
        root.CivicGuardAppInfo = api;
        mount(root.document?.getElementById("appInfo"));
    }
})(globalThis);
