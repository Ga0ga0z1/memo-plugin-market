package com.gaoyixuan.memo.nativebridge;
import com.gaoyixuan.memo.nativebridge.INativeReply;

// V1 transaction numbers and argument layouts are permanent.
oneway interface INativeProvider {
    void hello(int wireVersion, String capability, int major, String callId, INativeReply reply);
    void submit(int wireVersion, String callId, String mediaType, in byte[] payload, long deadlineElapsedMs);
    void cancel(int wireVersion, String callId);
}
