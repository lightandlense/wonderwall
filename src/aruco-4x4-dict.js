// Adds OpenCV's DICT_4X4_50 to js-aruco2's AR.DICTIONARIES registry.
//
// Why: js-aruco2 ships only ARUCO_MIP_36h12 (6x6) and ARUCO (5x5). For better
// detection at projection distance we want a 4x4 grid — each cell is ~2.25x
// the area of a 6x6 cell at the same print size, so thresholding/contour
// detection survives worse lighting.
//
// Codes were extracted from cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
// using opencv-contrib-python 4.13.0. Bit ordering: row-major, MSB = top-left,
// '1' = white cell — matches js-aruco2's existing _hex2bin / generateSVG
// convention so codes drop in without an encoder change.
//
// Load order in the HTML must be:
//   <script src=".../cv.js"></script>
//   <script src=".../aruco.js"></script>
//   <script src="src/aruco-4x4-dict.js"></script>   <-- this file
//
// After load, use `new AR.Dictionary('ARUCO_4X4_50')` or
// `new AR.Detector({ dictionaryName: 'ARUCO_4X4_50' })`.

(function () {
  if (typeof AR === 'undefined' || !AR.DICTIONARIES) {
    console.error('aruco-4x4-dict.js loaded before js-aruco2 — check script order');
    return;
  }
  AR.DICTIONARIES.ARUCO_4X4_50 = {
    nBits: 16,
    // tau auto-calculated by _calculateTau() — for DICT_4X4_50 it's 3.
    codeList: [
      0xb532, 0x0f9a, 0x332d, 0x9946, 0x549e, 0x79cd, 0x9e2e, 0xc4f2,
      0xfeda, 0xcf56, 0xf991, 0x11a7, 0x0eb7, 0x2a0f, 0x24b1, 0x263e,
      0x4665, 0x6600, 0x6c5e, 0x76af, 0x868b, 0xb02b, 0xccd5, 0xdd82,
      0xfe47, 0x9471, 0xace4, 0xa554, 0x2123, 0x346f, 0x4415, 0x57b2,
      0x9ecf, 0xf0cb, 0x08ae, 0x0929, 0x1875, 0x04ff, 0x0df6, 0x1c5a,
      0x1718, 0x2a28, 0x328c, 0x38b2, 0x24e8, 0x2eeb, 0x2d3f, 0x4b64,
      0x502e, 0x5013,
    ],
  };
})();
