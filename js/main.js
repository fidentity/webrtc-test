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
const snapshotButton = document.getElementById('snapshot');
const canvas = (window.canvas = document.getElementById('canvas'));
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const applyResolutionButton = document.getElementById('applyResolution');

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

async function testCodecs() {
    const codecsTable = document.getElementById('codecs');

    // clear codecsTable
    codecsTable.innerHTML = '';

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
        'av01.0.00M.08',
        'av01.0.00M.08',
        'av01.0.01M.08',
        'av01.0.04M.08',
        'av01.0.05M.08',
        'av01.0.08M.08',
        'av01.0.12M.08',
        'av01.0.12M.08',
        'av01.0.16M.08',

        // youtube:
        // youtube 144p:        av01.0.00M.08
        // youtube 240p:        av01.0.00M.08
        // youtube 320p:        av01.0.01M.08
        // youtube 480p:        av01.0.04M.08
        // youtube 720p:        av01.0.05M.08
        // youtube 1080p (Hd):  av01.0.08M.08
        // youtube, 1440p:      av01.0.12M.08
        // youtube, 2160p (4k): av01.0.12M.08
        // youtube, 4320p (8k): av01.0.16M.08

        // av1 scheint noch nicht wirklich irgendwo supported zu sein. wäre aber interessant.
        //   mp4        256x144    144p   73k , 'av01.0.05M.08',av01.0.00M.08, 25fps, video only, 1.72MiB
        //   mp4        426x240    240p  159k , a'av01.0.08M.08',v01.0.00M.08, 25fps, video only, 3.42MiB
        //   mp4        640x360    360p  340k , av01.0.01M.08, 25fps, video only, 6.68MiB
        //   mp4        854x480    480p  603k , av01.0.04M.08, 25fps, video only, 11.37MiB
        //   mp4        1280x720   720p 1133k , av01.0.05M.08, 25fps, video only, 22.07MiB
        //   mp4        1920x1080  1080p 2106k , av01.0.08M.08, 25fps, video only, 40.74MiB
        // https://www.matroska.org/technical/codec_specs.html
        // av01.2.19H.12.0.000.09.16.09.1
        // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter#av1
        // av01.<profile>.<level><tier>.<bitDepth>.<monochrome>.<chromaSubsampling>.<colorPrimaries>.<transferCharacteristics>.<matrixCoefficients>.<videoFullRangeFlag></videoFullRangeFlag>
        // av01.P.LLT.DD[.M.CCC.cp.tc.mc.F]
    ];
    const accelerations = ['prefer-hardware', 'prefer-software'];

    const configs = [];
    for (const codec of codecs) {
        for (const acceleration of accelerations) {
            configs.push({
                codec,
                hardwareAcceleration: acceleration,
                width: 1280,
                height: 1280,
            });
        }
    }

    let codecsObj = [];

    for (const cfg of configs) {
        await VideoEncoder.isConfigSupported(cfg).then((res) => {
            console.log(JSON.stringify(res));

            const codecString = res['config']['codec'];
            const hardwareAccel = res['config']['hardwareAcceleration'];
            const supported = res['supported'];

            if (supported) {
                codecsObj.push({ codec: codecString, hardwareAcceleration: hardwareAccel });
            }
        });
    }

    // sort by codec, descending
    codecsObj.sort((a, b) => (a.codec > b.codec ? 1 : -1));

    for (const c of codecsObj) {
        codecsTable.innerHTML += `<tr>
                <td>${c.codec} </td>
                <td>${c.hardwareAcceleration} </td>
                </tr>`;
    }
}

function handleError(error) {
    console.log('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

async function start() {
    if (window.stream) {
        window.stream.getTracks().forEach((track) => {
            track.stop();
        });
    }

    const videoSource = videoSelect.value;

    // get width and height from input fields, if set. else use default values
    const width = widthInput.value ? widthInput.value : undefined;
    const height = heightInput.value ? heightInput.value : undefined;

    const constraints = {
        audio: false,
        video: {
            deviceId: videoSource ? { exact: videoSource } : undefined,
            width: width ? { exact: width } : undefined,
            height: height ? { exact: height } : undefined,
        },
    };
    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).then(gotDevices).catch(handleError);

    snapshotButton.onclick = function () {
        // clear snapshot-output container
        document.querySelector('.snapshot-output').innerHTML = '';

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        var resolution = document.createElement('div');
        resolution.innerHTML = 'Resolution: ' + canvas.width + 'x' + canvas.height;

        document.querySelector('.snapshot-output').appendChild(resolution);

        // create download link
        var a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'snapshot.png';
        a.innerHTML = 'Download Snapshot';
        document.querySelector('.snapshot-output').appendChild(a);
    };

    await testCodecs();
}

videoSelect.onchange = start;
applyResolutionButton.onclick = start;

// call start() asynchronously
setTimeout(start, 0);
