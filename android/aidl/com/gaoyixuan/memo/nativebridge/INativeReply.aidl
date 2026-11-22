package com.gaoyixuan.memo.nativebridge;

// Echo callId. ready selects the exact contract. status 0 = success, 1 = unavailable,
// 2 = incompatible. For formula recognition the output is strict UTF-8 LaTeX (max 8192 bytes).
oneway interface INativeReply {
    void ready(int wireVersion, String callId, String capability, int major);
    void finished(int wireVersion, String callId, int status, in byte[] output);
}
