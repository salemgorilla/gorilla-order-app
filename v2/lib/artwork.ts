export type ArtworkAnalysis = {
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  isImage: boolean;
  width?: number;
  height?: number;
  rating: "Great" | "Good" | "Needs Review";
  notes: string[];
};

export async function analyzeArtworkFile(file: File): Promise<ArtworkAnalysis> {
  const fileType = file.name.split(".").pop()?.toUpperCase() || "UNKNOWN";
  const fileSizeMB = Number((file.size / 1024 / 1024).toFixed(2));
  const isImage = file.type.startsWith("image/");

  if (!isImage) {
    return {
      fileName: file.name,
      fileType,
      fileSizeMB,
      isImage,
      rating: "Good",
      notes: [
        "Vector or document artwork uploaded.",
        "Gorilla Salem will review this file before production.",
      ],
    };
  }

  const dimensions = await getImageDimensions(file);

  const notes: string[] = [];

  if (dimensions.width >= 1000 && dimensions.height >= 1000) {
    notes.push("Image size looks strong for sticker printing.");
  } else {
    notes.push("Image may be small depending on final print size.");
  }

  notes.push("Gorilla Salem will review artwork before production.");

  return {
    fileName: file.name,
    fileType,
    fileSizeMB,
    isImage,
    width: dimensions.width,
    height: dimensions.height,
    rating:
      dimensions.width >= 1500 && dimensions.height >= 1500
        ? "Great"
        : dimensions.width >= 800 && dimensions.height >= 800
          ? "Good"
          : "Needs Review",
    notes,
  };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      resolve({
        width: image.width,
        height: image.height,
      });

      URL.revokeObjectURL(url);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image dimensions."));
    };

    image.src = url;
  });
}