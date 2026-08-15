---
layout: post
title: "Why Your Modbus CRC Keeps Failing: Algorithm Variants, Byte Order, and the Check Value"
date: 15 August 2026
tags: [Security & Hash]
excerpt: Most Modbus RTU CRC mismatches are not math bugs. They come from picking the wrong CRC-16 variant, reversing the two CRC bytes, or hashing the wrong slice of the frame. This post walks through a debugging sequence you can reuse — starting with the catalogue check value 0x4B37 — and how to confirm CRC-16/MODBUS in a browser calculator.
---

A Modbus RTU slave that never answers is often not a broken UART, a wrong baud rate, or a mysterious silicon bug. The frame looks fine in a logic analyzer. Function code and register address match the spec. Then you notice the last two bytes: the CRC does not match what the device computed. That mismatch is the most common integrity failure in industrial serial work, and it is almost never because polynomial division itself is hard. If you need to reproduce a CRC-16/MODBUS result while you read, the [CRC Calculator](/crc/) can compute the same catalogue-defined variant locally in the browser.

This post is not a CRC primer. The polynomial picture and the Ethernet / CAN / 1-Wire landscape are already in [Data Integrity Verification with CRC](/blog/2025-12-27-crc/). The question here is narrower and more annoying: **why do two implementations that both say "CRC-16" disagree on a Modbus frame, and how do you isolate the cause in a few minutes?**

## Start With the Check Value, Not the Live Frame

Greg Cook's [Catalogue of parametrised CRC algorithms](https://reveng.sourceforge.io/crc-catalogue/) treats every named CRC as a parameter set, not a marketing label. The parameters that actually change the output are width, generator polynomial (`poly`), initial register value (`init`), input reflection (`refin`), output reflection (`refout`), and final XOR (`xorout`). The catalogue also publishes a **check** value: the CRC of the nine ASCII bytes `123456789`. That single vector is the cheapest way to tell whether your code, library, or online tool is running the algorithm you think it is.

For **CRC-16/MODBUS** the parameters are:

```text
width=16  poly=0x8005  init=0xFFFF
refin=true  refout=true  xorout=0x0000
check=0x4B37
```

If you feed `123456789` as ASCII (not as hex `31 32 33...` typed by hand unless you really mean those bytes) and you do **not** get `0x4B37`, stop. Do not debug the PLC, the transceiver, or the rest of the PDU yet. The calculator or the firmware routine is a different algorithm, no matter what the dropdown is labelled.

<!-- 그림: ASCII 문자열 "123456789"가 CRC-16/MODBUS 파라미터를 거쳐 check 값 0x4B37이 되는 한 줄 흐름. 입력 박스 → 파라미터(poly/init/refin) → 출력 0x4B37. 영어 라벨만. -->
<p class="blog-image">
  <img src="/blog/assets/crc/modbus_crc_check_vector.png" alt="Flow from ASCII input 123456789 through CRC-16/MODBUS parameters to the catalogue check value 0x4B37">
</p>
<p align="center">
  <em>The catalogue check value is the CRC of ASCII "123456789". For CRC-16/MODBUS that result must be 0x4B37 before you trust the tool on a real frame.</em>
</p>

Why does this catch so many bugs? Because the next-door neighbours of CRC-16/MODBUS look similar on paper. CRC-16/ARC uses the **same polynomial and the same reflection**, but `init=0x0000`. Its check value is `0xBB3D`. CRC-16/IBM-3740 (often sold in UIs as "CCITT-FALSE") uses `poly=0x1021`, `init=0xFFFF`, and **no** reflection; its check value is `0x29B1`. Pick either of those by accident and every Modbus frame you compute will be consistently wrong — which is worse than a random error, because the wrong CRC looks systematic and "implementation-like."

## Same Name, Different Algorithm

Embedded datasheets, Stack Overflow answers, and vendor libraries all say "CRC-16." That string is not an algorithm. Ross Williams's [A Painless Guide to CRC Error Detection Algorithms](http://www.ross.net/crc/download/crc_v3.txt) is still the document that makes the parameter list explicit; without it, two engineers can both be "correct" and still not interoperate.

A compact comparison for the three mix-ups that show up in Modbus debugging:

| Catalogue name | poly | init | refin / refout | check |
|---|---|---|---|---|
| CRC-16/MODBUS | `0x8005` | `0xFFFF` | true / true | `0x4B37` |
| CRC-16/ARC | `0x8005` | `0x0000` | true / true | `0xBB3D` |
| CRC-16/IBM-3740 | `0x1021` | `0xFFFF` | false / false | `0x29B1` |

The Modbus Application Protocol spec ([V1.1b3, PDF](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf)) describes the RTU frame and points implementers at CRC-16 with the reflected `0xA001` polynomial — that is CRC-16/MODBUS, not ARC and not CCITT-FALSE. The low-level bit loop you see in firmware is usually:

```c
uint16_t crc16_modbus(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            if (crc & 0x0001)
                crc = (crc >> 1) ^ 0xA001; /* reflected 0x8005 */
            else
                crc >>= 1;
        }
    }
    return crc;
}
```

`0xA001` is not a different polynomial from `0x8005`. It is the bit-reversed form used when `refin`/`refout` are true and you shift **right**. If your code XORs `0x8005` while shifting **left**, you have silently switched families. The check value will not be `0x4B37`.

<!-- 그림: 세 알고리즘 행 비교 표. MODBUS / ARC / IBM-3740. init와 refin 칸을 색으로 구분하고 check 열을 강조. 영어만. -->
<p class="blog-image">
  <img src="/blog/assets/crc/modbus_crc_variant_table.png" alt="Table comparing CRC-16/MODBUS, CRC-16/ARC, and CRC-16/IBM-3740 parameters and check values">
</p>
<p align="center">
  <em>Three 16-bit CRCs that get confused in Modbus work. Only CRC-16/MODBUS has check=0x4B37.</em>
</p>

When you already know you need CRC rather than a checksum or SHA-256, [Checksum vs CRC vs Hash](/blog/2026-03-15-crc-comparison/) covers the security boundary. For this article the trap is smaller: **CRC was the right family, the wrong member.**

## Byte Order on the Wire Is a Second Algorithm

Even after the 16-bit remainder is correct, Modbus RTU still has a packing rule. The CRC is appended **low byte first** (little-endian). A register value of `0xCDC5` becomes the two trailing bytes `C5 CD` on the UART.

Take a Read Holding Registers request, slave `0x01`, starting at address `0`, quantity `10`:

```text
PDU (CRC not included):  01 03 00 00 00 0A
CRC-16/MODBUS:           0xCDC5
Bytes on the wire:       01 03 00 00 00 0A C5 CD
```

If your calculator shows `CDC5` and you append `CD C5` because that is how you would write a 16-bit hex constant in a comment, the slave computes a different remainder over a different byte string and stays silent. That is the same class of bug as sending `0x2B A1` when the device expected `A1 2B` — the story in [Understanding Endianness](/blog/2026-03-04-endian/). Network byte order is big-endian; Modbus CRC bytes are not.

<p class="blog-image">
  <img src="/blog/assets/crc/modbus_frame_structure.png" alt="MODBUS RTU frame layout with device ID, function code, data bytes, and CRC-16 checksum shown in hexadecimal">
</p>
<p align="center">
  <em>MODBUS RTU request layout. The CRC occupies the last two bytes, low byte first.</em>
</p>

A practical check: if swapping the two CRC bytes makes the device answer, your polynomial path was already correct. You were fighting endianness, not CRC-16/ARC.

The [Endian Converter](/endian/) is useful when the same dump mixes 16-bit register values (Modbus register payload is big-endian) with a little-endian CRC trailer. Those two conventions live in one frame. Mixing them in your head is a reliable way to waste an afternoon.

## Hash the PDU, Not the Whole Capture

The CRC covers **slave address + PDU**, and nothing after. Typical mistakes:

- Including the two CRC bytes in the input, then wondering why the remainder is not zero. (For this reflected CRC, a correctly appended frame does reduce to a known residue — but if you are comparing against `0x4B37`-style tools, you compute over the payload **without** the trailer.)
- Including UART framing, timestamps, or a hex-dump address column copied from a terminal.
- Dropping the slave address and hashing only the function code and data.
- Feeding a hex string as ASCII: typing `01 03` as the characters `0`, `1`, space, `0`, `3` instead of the bytes `0x01 0x03`.

The last one is especially common with web calculators. Input mode matters. ASCII `"123456789"` is the check vector. A Modbus frame is **hex bytes**. If the tool's HEX mode still interprets spaces as ASCII 0x20, your remainder will include those spaces as extra data.

Firmware that builds the frame in a buffer should CRC `buf[0 .. pdu_len)` and then write:

```c
uint16_t crc = crc16_modbus(buf, pdu_len);
buf[pdu_len]     = (uint8_t)(crc & 0xFF);        /* low byte */
buf[pdu_len + 1] = (uint8_t)((crc >> 8) & 0xFF); /* high byte */
```

If you `memcpy` the `uint16_t` on a little-endian MCU, you often get the right order by accident. The same `memcpy` on a big-endian core, or a Python `struct.pack('>H', crc)`, reverses it. Explicit byte stores are less clever and less wrong.

## A Debugging Sequence That Usually Ends the Argument

When a capture and a calculator disagree, walk this list in order. Skipping to "rewrite the bit loop" is how the same bug survives a refactor.

1. **Prove the algorithm.** ASCII `123456789` → `0x4B37`. If not, change the named variant or the `init`/`refin` flags until it matches. Do not touch the field frame yet.
2. **Prove the input encoding.** Paste the PDU as hex bytes with no CRC trailer. Confirm the tool is in HEX mode, not ASCII.
3. **Compare the 16-bit remainder**, not the two on-wire bytes. If the remainder matches `0xCDC5` for `01 03 00 00 00 0A` and the device still NAKs, look at byte order next.
4. **Swap the two CRC bytes** in the transmitted frame once. If the slave answers, fix packing; leave the polynomial alone.
5. **Check coverage.** Address byte included? CRC bytes excluded? No extra `0x00` padding from a fixed-length buffer?

<!-- 그림: 5단계 디버깅 순서도. 1 Check 0x4B37 → 2 HEX input → 3 remainder → 4 swap CRC bytes → 5 coverage. 실패 시 어느 단계로 돌아가는지 화살표. 영어 라벨. -->
<p class="blog-image">
  <img src="/blog/assets/crc/modbus_crc_debug_flow.png" alt="Five-step flowchart for debugging a Modbus CRC mismatch from check value through byte order">
</p>
<p align="center">
  <em>Isolate algorithm, encoding, remainder, on-wire byte order, then coverage. Most field failures die in steps 1 or 4.</em>
</p>

A second frame for a sanity check, used in the earlier CRC guide: `01 03 00 00 00 02` should yield remainder `0x0BC4`, on the wire `C4 0B`. If one frame matches and the other does not, you are usually including a length-dependent pad or hashing past `pdu_len`.

Lookup-table implementations deserve one extra look. A 256-entry table generated for CRC-16/ARC (`init` does not change the table, but people generate tables with the wrong poly or the unreflected `0x8005` left-shift method) will fail the check value even if the wrapper still says `0xFFFF`. The [CRC Lookup Table](/crc-lookup-table/) generator is there specifically so the 256 constants you paste into C match the same catalogue row as the slow bit loop.

## Confirming a Frame in the CRC Calculator

Open the [CRC Calculator](/crc/). You want three things on screen before you trust a field dump.

Select **CRC-16/MODBUS** from the algorithm list — do not stop at the first "CRC-16" row. Set input to **HEX** and paste `01 03 00 00 00 0A` (spaces are fine if the tool treats them as separators). Read the remainder as hex. Then set **byte order** to little-endian so the copy-paste value is `C5 CD`, the order that actually goes on the RS-485 pair.

The same input with CRC-16/ARC or CRC-16/IBM-3740 will produce a different remainder. That comparison is the point of a multi-algorithm calculator: you are not looking for a pretty UI, you are looking for the named row whose check value you already verified. Because the computation runs in WebAssembly in the browser, prototype firmware dumps do not have to leave the machine — the same local-processing argument as in [why WASM matters for browser calculators](/blog/2026-05-10-webassembly/).

If you are implementing rather than only checking, run the check vector in your unit tests:

```text
crc16_modbus("123456789") == 0x4B37
crc16_modbus(01 03 00 00 00 0A) == 0xCDC5
```

Those two asserts catch wrong poly, wrong init, wrong reflection, and (if you also pack the frame in the test) wrong endianness. They are cheaper than another hour on the bus analyzer.

## What This Does Not Fix

A correct CRC does not mean the slave will do what you wanted. Illegal function, illegal address, and exception codes are application-layer failures with a **valid** CRC. Conversely, CRC is still only accidental-error detection: it will not stop someone who can rewrite both payload and remainder. Use it to get frames on and off the wire. Do not use it as a substitute for authentication.

The reliable habit is boring. Name the catalogue row. Check `0x4B37`. Pack low byte first. Hash the PDU you think you hashed. After that, Modbus CRC almost never "keeps failing" — it was a different CRC, or the same CRC in the other byte order.

## References

1. **Greg Cook**, [Catalogue of parametrised CRC algorithms](https://reveng.sourceforge.io/crc-catalogue/) — Parameter sets and check values, including CRC-16/MODBUS (`check=0x4B37`)
2. **Ross Williams**, [A Painless Guide to CRC Error Detection Algorithms](http://www.ross.net/crc/download/crc_v3.txt) — Width, poly, init, refin, refout, xorout explained as an implementation contract
3. **Modbus Organization**, [Modbus Application Protocol Specification V1.1b3](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf) — RTU frame layout and CRC-16 appendix
4. **Modbus Tools**, [Modbus Protocol Description](https://www.modbustools.com/modbus.html) — RTU framing and CRC placement used in field tools
