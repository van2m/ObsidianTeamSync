// Collaborative editing protocol types / 协同编辑协议类型
// Binary frame format: [1 byte msgType][8 bytes pathHash ASCII hex][...payload]

/** Binary collaboration message types */
export enum CollabMsgType {
  // Yjs sync protocol
  YjsSyncStep1    = 0x01,
  YjsSyncStep2    = 0x02,
  YjsUpdate       = 0x03,

  // Awareness protocol
  AwarenessUpdate = 0x10,

  // Room management
  RoomJoin        = 0x20,
  RoomLeave       = 0x21,
  RoomJoinAck     = 0x22,
  RoomError       = 0x23,
}

/** Total header length: 1 (msgType) + 8 (pathHash) = 9 bytes */
export const COLLAB_HEADER_LENGTH = 9;

const HEX_REGEX = /^[0-9a-f]{8}$/;

/** Encode a collaboration message into a binary frame */
export function encodeCollabMessage(
  msgType: CollabMsgType,
  pathHash: string,
  payload?: Uint8Array,
): Uint8Array {
  if (pathHash.length !== 8) {
    throw new Error(`pathHash must be exactly 8 chars, got ${pathHash.length}`);
  }

  const payloadLen = payload ? payload.byteLength : 0;
  const buf = new Uint8Array(COLLAB_HEADER_LENGTH + payloadLen);

  // 1 byte: message type
  buf[0] = msgType;

  // 8 bytes: pathHash as ASCII hex
  for (let i = 0; i < 8; i++) {
    buf[1 + i] = pathHash.charCodeAt(i);
  }

  // remaining: payload
  if (payload && payloadLen > 0) {
    buf.set(payload, COLLAB_HEADER_LENGTH);
  }

  return buf;
}

/** Decode a binary frame into its parts */
export function decodeCollabMessage(data: Uint8Array): {
  msgType: CollabMsgType;
  pathHash: string;
  payload: Uint8Array;
} {
  if (data.byteLength < COLLAB_HEADER_LENGTH) {
    throw new Error(`Collab message too short: ${data.byteLength} bytes`);
  }

  const msgType = data[0] as CollabMsgType;

  // Extract 8-byte ASCII hex pathHash
  let pathHash = '';
  for (let i = 0; i < 8; i++) {
    pathHash += String.fromCharCode(data[1 + i]);
  }

  // Validate pathHash is hex
  if (!HEX_REGEX.test(pathHash)) {
    throw new Error(`Invalid pathHash in collab message: ${pathHash}`);
  }

  const payload = data.subarray(COLLAB_HEADER_LENGTH);

  return { msgType, pathHash, payload };
}
