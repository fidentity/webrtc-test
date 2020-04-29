/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const videoElement = document.querySelector('video');
const videoSelect = document.querySelector('select#videoSource');
const selectors = [videoSelect];

function gotDevices(deviceInfos) {
    deviceInfos = deviceInfos.filter(x => x.kind === 'videoinput');
    // Handles being called several times to update labels. Preserve values.
    const values = selectors.map(select => select.value);
    selectors.forEach(select => {
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }
    });
    for (let i = 0; i !== deviceInfos.length; ++i) {
        const deviceInfo = deviceInfos[i];
        const option = document.createElement('option');
        option.value = deviceInfo.deviceId;

        if (deviceInfo.kind === 'videoinput') {
            option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
            videoSelect.appendChild(option);
        } else {
            console.log('Some other kind of source/device: ', deviceInfo);
        }
    }
    selectors.forEach((select, selectorIndex) => {
        if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[selectorIndex])) {
            select.value = values[selectorIndex];
        }
    });
}

navigator.mediaDevices
    .enumerateDevices()
    .then(gotDevices)
    .catch(handleError);

function gotStream(stream) {
    window.stream = stream; // make stream available to console
  

    document.getElementById('capabilities').innerHTML = 'loading capabilities...';

    // solution from https://www.oberhofer.co/mediastreamtrack-and-its-capabilities/
    videoElement.addEventListener('loadedmetadata', function metadataLoaded() {
        window.setTimeout(() => {
            // ###################### Log Debug output ######################
            console.log('#####################################################');
            var numtracks = stream.getVideoTracks().length;
            console.log('Number of Tracks: ', numtracks);
            var cap = stream.getVideoTracks()[0].getCapabilities();
            console.log('window.stream.getVideoTracks()[0].getCapabilities()');
            console.log(cap);

            var capabilities = JSON.stringify(cap, null, 2);

            document.getElementById('capabilities').innerHTML = capabilities;
            document.getElementById('numtracks').innerHTML = numtracks;
            videoElement.removeEventListener('loadedmetadata', metadataLoaded);
            // ##############################################################
        }, 500);
    });

    videoElement.srcObject = stream;
    
    // Refresh button list in case labels have become available
    return navigator.mediaDevices.enumerateDevices();
}

function handleError(error) {
    console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

function start() {
    if (window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    const videoSource = videoSelect.value;
    const constraints = {
        audio: false,
        video: { deviceId: videoSource ? { exact: videoSource } : undefined },
    };
    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(gotStream)
        .then(gotDevices)
        .catch(handleError);
}

videoSelect.onchange = start;

start();
