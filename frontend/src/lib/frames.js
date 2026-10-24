/** Grab the current frame of a <video> element as a compressed JPEG data URL (for the vision model). */
export function captureFrame(video, maxWidth = 640, quality = 0.65) {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
