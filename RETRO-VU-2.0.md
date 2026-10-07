# Retro VU 2.0.0

## Sources and transport
- USB/VINIL retains the validated capture, mono PCM16, reliable ordered DataChannel, 20 ms blocks, bounded backpressure and five-second receiver buffer. Source rate is the actual AudioContext rate, with input rate retained in metadata.
- PLAYER uses one HTMLAudioElement and one stable Web Audio stereo bus. Changing src for the next local file does not replace the bus, source session or peers. Mono files are rendered by the browser in that stereo bus; it is not a claim that the original file was stereo. No files are uploaded. Audio codecs are those the browser can decode; WAV PCM16 and older WebM remain accepted.
- MICROFONE uses speech constraints and the existing signaling, with addTrack for each peer. Browser-negotiated WebRTC voice codec (typically Opus), not lossless musical PCM and not the five-second buffer. Track.enabled and a control message mute local capture and receiver output. No zero-latency guarantee. One microphone capture is shared by peers, monitor and REC. A USB default identified after permission is replaced sequentially with an enumerated non-USB microphone, never opened concurrently.
- No TURN service added. Restrictive NAT/firewalls may still prevent a peer connection. Open/private sessions and Upstash unchanged. Receivers must also load v2 before receiving voice.

## Playlist
LOAD accepts multiple audio files; the PLAYLIST control opens previous/next/repeat/shuffle and a folder action. Directory selection reads files in the chosen directory, sorted by name (not recursive). Unsupported directory API, including common Android installations, uses multiple audio selection instead. Files and queue live only in memory until reload. The same player continues across screens; end of last song stops local playback unless repeat is enabled, keeping a transmitting session available until TRANSMITIR is turned off.

## REC
USB and player recordings tap the source before network transport. Receiver REC taps the current digital Web Audio playback source; it does not recapture speakers or import earlier recorded blocks. Musical reception retains its normal five-second playout delay. Recording starts at the REC gesture after storage initialization and records ongoing playout, including clean silence during rebuffering/STOP. Voice REC records decoded voice; WAV does not undo the voice codec's compression.
The existing progressive OPFS PCM16 writer, validation, archive, preview and export are reused. Peer end finalizes a partial WAV before closing its context. Memory remains bounded by the existing worker credits. Practical limit is the lower of storage quota minus reserve and 2 GiB per file (about 6.2 h mono or 3.1 h stereo at 48 kHz). Downloads remain under browser/Android control; internal files remain tied to this origin and must be exported before clearing site data.

## PWA
Existing versioned service-worker caching is preserved. No update controls in STREAM. Close all Retro VU tabs and standalone windows after the new worker downloads, then reopen the same production URL; do not clear app/site storage. No forced reload during active audio or recording.

## Physical acceptance
1. Close/reopen both devices after release. Motorola: USB/VINIL -> open transmission; PC and second Android: RECEBER -> CONECTAR -> wait about 5 s. Check unchanged sound, MONITOR, VU, night mode and navigation.
2. RADIO LOAD: choose WAV + older WebM + another supported song. Open PLAYLIST; check next/previous, repeat/shuffle and folder fallback. STREAM -> TRANSMITIR -> PLAYER -> TRANSMITIR. Cross a song boundary while receivers stay connected.
3. Stop transmission; choose MICROFONE, grant permission, open/private as desired. Check immediate voice reception (no 5 s countdown), SILENCIAR/ATIVAR and receiver MIC/status lights. Use headphones to prevent acoustic feedback.
4. Receiver: REC, listen for at least 30 s, REC again. Preview and export WAV; check duration. Repeat and stop transmitter while recording: receiver must offer a valid partial file. Also repeat original USB REC.
5. Inspect portrait/landscape, all five themes, COLOR, source/privacy dialogs, recording result and playlist. Confirm no essential control is clipped.

No physical Motorola/Numark/JBL test is claimed by automated checks.
