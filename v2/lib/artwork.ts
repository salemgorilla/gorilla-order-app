export type ArtworkAnalysis = {
  fileName: string;
  fileType: string;
  fileSize: string;
  dimensions: string;
  width: number | null;
  height: number | null;
  estimatedColorCount: number | null;
  colorCountConfidence: "low" | "medium" | "high";
  palette: string[];
  // True when a near-pure magenta (cut-line) color is found in the artwork.
  magentaDetected: boolean;
  notes: string[];
};

// Near-pure magenta (~255,0,255): high red + blue, low green, red≈blue.
// Used to auto-spot a customer's die-cut line without false-firing on
// ordinary red/blue/pink art.
function isMagentaPixel(red: number, green: number, blue: number) {
  return (
    red > 190 &&
    blue > 190 &&
    green < 100 &&
    red - green > 90 &&
    blue - green > 90 &&
    Math.abs(red - blue) < 60
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function quantizeColor(value: number) {
  return Math.round(value / 48) * 48;
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, value));
}

function getEstimatedColorsFromImage(file: File) {
  return new Promise<Pick<
    ArtworkAnalysis,
    | "dimensions"
    | "width"
    | "height"
    | "estimatedColorCount"
    | "colorCountConfidence"
    | "palette"
    | "magentaDetected"
    | "notes"
  >>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const maxSize = 140;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        URL.revokeObjectURL(objectUrl);

        resolve({
          dimensions: `${image.width} × ${image.height}px`,
          width: image.width,
          height: image.height,
          estimatedColorCount: null,
          colorCountConfidence: "low",
          palette: [],
          magentaDetected: false,
          notes: ["Could not analyze image colors."],
        });

        return;
      }

      context.drawImage(image, 0, 0, width, height);

      const imageData = context.getImageData(0, 0, width, height).data;
      const colorCounts = new Map<string, number>();
      let sampledPixels = 0;
      let magentaPixels = 0;

      for (let index = 0; index < imageData.length; index += 4) {
        const alpha = imageData[index + 3];

        if (alpha < 40) {
          continue;
        }

        // Check magenta on the raw (un-quantized) values for accuracy.
        if (
          isMagentaPixel(
            imageData[index],
            imageData[index + 1],
            imageData[index + 2]
          )
        ) {
          magentaPixels += 1;
        }

        const red = quantizeColor(imageData[index]);
        const green = quantizeColor(imageData[index + 1]);
        const blue = quantizeColor(imageData[index + 2]);

        const key = `${clampColor(red)},${clampColor(green)},${clampColor(blue)}`;

        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        sampledPixels += 1;
      }

      // A deliberate cut line leaves a small run of magenta even downscaled.
      const magentaDetected = magentaPixels >= 4;

      const minimumPixelShare = Math.max(6, sampledPixels * 0.012);

      const sortedColors = Array.from(colorCounts.entries())
        .filter(([, count]) => count >= minimumPixelShare)
        .sort((a, b) => b[1] - a[1]);

      const estimatedColorCount = Math.max(1, Math.min(sortedColors.length, 8));

      const palette = sortedColors.slice(0, 6).map(([key]) => {
        const [red, green, blue] = key.split(",").map(Number);
        return rgbToHex(red, green, blue);
      });

      const notes: string[] = [
        "Color count is estimated from the uploaded preview image.",
        "Tiny anti-aliased pixels and very small color areas are filtered out.",
      ];

      if (sortedColors.length > 5) {
        notes.push("Artwork may be full color or need manual color separation.");
      }

      if (magentaDetected) {
        notes.push("Magenta cut line detected — used as the die-cut path.");
      }

      URL.revokeObjectURL(objectUrl);

      resolve({
        dimensions: `${image.width} × ${image.height}px`,
        width: image.width,
        height: image.height,
        estimatedColorCount,
        colorCountConfidence: sortedColors.length > 5 ? "medium" : "high",
        palette,
        magentaDetected,
        notes,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      resolve({
        dimensions: "Not available",
        width: null,
        height: null,
        estimatedColorCount: null,
        colorCountConfidence: "low",
        palette: [],
        magentaDetected: false,
        notes: ["This file type could not be previewed for color analysis."],
      });
    };

    image.src = objectUrl;
  });
}

export async function analyzeArtworkFile(file: File): Promise<ArtworkAnalysis> {
  const baseAnalysis = {
    fileName: file.name,
    fileType: file.type || "Unknown",
    fileSize: formatFileSize(file.size),
  };

  if (!file.type.startsWith("image/")) {
    return {
      ...baseAnalysis,
      dimensions: "Not available",
      width: null,
      height: null,
      estimatedColorCount: null,
      colorCountConfidence: "low",
      palette: [],
      magentaDetected: false,
      notes: ["Upload an image file to estimate color count."],
    };
  }

  const imageAnalysis = await getEstimatedColorsFromImage(file);

  return {
    ...baseAnalysis,
    ...imageAnalysis,
  };
}
