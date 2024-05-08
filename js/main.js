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
const button = document.getElementById('snapshot');
const canvas = (window.canvas = document.getElementById('canvas'));

function gotDevices(deviceInfos) {
    deviceInfos = deviceInfos.filter((x) => x.kind === 'videoinput');
    // Handles being called several times to update labels. Preserve values.
    const values = selectors.map((select) => select.value);
    selectors.forEach((select) => {
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
        if (Array.prototype.slice.call(select.childNodes).some((n) => n.value === values[selectorIndex])) {
            select.value = values[selectorIndex];
        }
    });
}

navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

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

function testCodecs() {
    const codecs = [
        // baseline
        'avc1.42E01E',
        'avc1.4D401E',
        'avc1.640028',
        'avc1.42001E',
        'avc1.42101E',
        'avc1.42701E',
        'avc1.42F01E',
        'avc3.42E01E',
        'avc3.42801E',
        'avc3.42C01E',

        // level 1
        'avc1.42E00A',
        'avc1.42E00B',
        'avc1.42E00C',
        'avc1.42E00D',

        // level 2. bis 4Mbit/s
        'avc1.42E014',
        'avc1.42E015',
        'avc1.42E016',

        // modern codecs
        'vp8',
        'vp8.0',
        'vp09.00.10.08',
        'vp09.01.10.08',
        'vp09.02.10.08',
        'vp09.03.10.08',
        'av01.0.04M.08',
    ];
    const accelerations = ['prefer-hardware', 'prefer-software'];

    const configs = [];
    for (const codec of codecs) {
        for (const acceleration of accelerations) {
            configs.push({
                codec,
                hardwareAcceleration: acceleration,
                width: 640,
                height: 480,
            });
        }
    }

    const codecsTable = document.getElementById('codecs');

    for (const cfg of configs) {
        VideoEncoder.isConfigSupported(cfg).then((res) => {
            console.log(JSON.stringify(res));

            const codecString = res['config']['codec'];
            const hardwareAccel = res['config']['hardwareAcceleration'];
            const supported = res['supported'];

            if (supported) {
                codecsTable.innerHTML += `<tr>
                        <td>${codecString} </td>
                        <td>${hardwareAccel} </td>
                        </tr>`;
            }
        });
    }
}

function handleError(error) {
    console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

function start() {
    if (window.stream) {
        window.stream.getTracks().forEach((track) => {
            track.stop();
        });
    }
    const videoSource = videoSelect.value;
    const constraints = {
        audio: false,
        video: { deviceId: videoSource ? { exact: videoSource } : undefined },
    };
    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).then(gotDevices).catch(handleError);

    button.onclick = function () {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        var resolution = document.createElement('div');
        resolution.innerHTML = 'Resolution: ' + canvas.width + 'x' + canvas.height;
        document.querySelector('.snapshot-container').appendChild(resolution);

        // create download link
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'snapshot.png';
        a.innerHTML = 'Download Snapshot';
        document.querySelector('.snapshot-container').appendChild(a);
    };

    testCodecs();
}

videoSelect.onchange = start;

start();
