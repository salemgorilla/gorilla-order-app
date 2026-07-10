type SsProduct = {
  sku?: string;
  styleID?: number;
  brandName?: string;
  styleName?: string;
  colorName?: string;
  color1?: string;
  color2?: string;
  colorSwatchImage?: string;
  colorFrontImage?: string;
  colorBackImage?: string;
  colorSideImage?: string;
  sizeName?: string;
  sizeOrder?: string;
  customerPrice?: number;
  qty?: number;
};

export type GorillaCatalogSize = {
  sku: string;
  sizeName: string;
  markedUpPrice: number;
  isAvailable: boolean;
  outOfStock: boolean;
  wholesalePrice?: number;
};

export type GorillaCatalogColor = {
  colorName: string;
  colorHex: string | null;
  swatchImage: string | null;
  frontImage: string | null;
  backImage: string | null;
  sideImage: string | null;
  isAvailable: boolean;
  outOfStock: boolean;
  sizes: GorillaCatalogSize[];
};

export type GorillaCatalogProduct = {
  id: string;
  brandName: string;
  styleName: string;
  displayName: string;
  colors: GorillaCatalogColor[];
};

export type GorillaCatalogResponse = {
  source: "ss-activewear";
  generatedAt: string;
  markupRate: number;
  products: GorillaCatalogProduct[];
  warnings?: string[];
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getMarkupRate() {
  const rawRate = process.env.SS_MARKUP_RATE || "0.4";
  const parsedRate = Number(rawRate);

  if (Number.isNaN(parsedRate)) {
    return 0.4;
  }

  return parsedRate;
}

function getBasicAuthHeader() {
  const accountNumber = getRequiredEnv("SS_ACCOUNT_NUMBER");
  const apiKey = getRequiredEnv("SS_API_KEY");

  const token = Buffer.from(`${accountNumber}:${apiKey}`).toString("base64");

  return `Basic ${token}`;
}

function getImageUrl(imagePath?: string) {
  if (!imagePath) {
    return null;
  }

  if (imagePath.startsWith("http")) {
    return imagePath;
  }

  const largeImagePath = imagePath.replace("_fm", "_fl");

  return `https://www.ssactivewear.com/${largeImagePath}`;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getMarkedUpPrice(customerPrice: number | undefined, markupRate: number) {
  if (!customerPrice) {
    return 0;
  }

  return roundCurrency(customerPrice * (1 + markupRate));
}

function sortSizes(a: GorillaCatalogSize, b: GorillaCatalogSize) {
  const sizeOrder = [
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
  ];

  const aIndex = sizeOrder.indexOf(a.sizeName);
  const bIndex = sizeOrder.indexOf(b.sizeName);

  if (aIndex === -1 && bIndex === -1) {
    return a.sizeName.localeCompare(b.sizeName);
  }

  if (aIndex === -1) {
    return 1;
  }

  if (bIndex === -1) {
    return -1;
  }

  return aIndex - bIndex;
}

function normalizeProducts(
  products: SsProduct[],
  options: {
    markupRate: number;
    exposeWholesale: boolean;
  }
): GorillaCatalogProduct[] {
  const productMap = new Map<string, GorillaCatalogProduct>();

  for (const product of products) {
    const styleID =
      product.styleID?.toString() || product.styleName || product.sku || "unknown";
    const brandName = product.brandName || "Unknown Brand";
    const styleName = product.styleName || "Unknown Style";
    const productKey = `${brandName}-${styleName}-${styleID}`;
    const colorName = product.colorName || "Unknown Color";

    if (!productMap.has(productKey)) {
      productMap.set(productKey, {
        id: productKey,
        brandName,
        styleName,
        displayName: `${brandName} ${styleName}`,
        colors: [],
      });
    }

    const normalizedProduct = productMap.get(productKey)!;

    let color = normalizedProduct.colors.find(
      (item) => item.colorName === colorName
    );

    if (!color) {
      color = {
        colorName,
        colorHex: product.color1 || null,
        swatchImage: getImageUrl(product.colorSwatchImage),
        frontImage: getImageUrl(product.colorFrontImage),
        backImage: getImageUrl(product.colorBackImage),
        sideImage: getImageUrl(product.colorSideImage),
        isAvailable: false,
        outOfStock: true,
        sizes: [],
      };

      normalizedProduct.colors.push(color);
    }

    const isAvailable = Number(product.qty || 0) > 0;
    const markedUpPrice = getMarkedUpPrice(
      Number(product.customerPrice || 0),
      options.markupRate
    );

    color.sizes.push({
      sku: product.sku || "",
      sizeName: product.sizeName || "Unknown Size",
      markedUpPrice,
      isAvailable,
      outOfStock: !isAvailable,
      ...(options.exposeWholesale
        ? { wholesalePrice: Number(product.customerPrice || 0) }
        : {}),
    });

    if (isAvailable) {
      color.isAvailable = true;
      color.outOfStock = false;
    }
  }

  const normalizedProducts = Array.from(productMap.values());

  for (const product of normalizedProducts) {
    for (const color of product.colors) {
      color.sizes.sort(sortSizes);
    }

    product.colors.sort((a, b) => a.colorName.localeCompare(b.colorName));
  }

  return normalizedProducts.sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

const productFields = [
  "Sku",
  "StyleID",
  "BrandName",
  "StyleName",
  "ColorName",
  "Color1",
  "Color2",
  "ColorSwatchImage",
  "ColorFrontImage",
  "ColorBackImage",
  "ColorSideImage",
  "SizeName",
  "SizeOrder",
  "CustomerPrice",
  "Qty",
].join(",");

async function fetchProductsForStyle(style: string) {
  const url = new URL("https://api.ssactivewear.com/v2/products/");
  url.searchParams.set("style", style);
  url.searchParams.set("fields", productFields);
  url.searchParams.set("mediatype", "json");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: getBasicAuthHeader(),
      Accept: "application/json",
    },
    next: {
      revalidate: 60 * 60,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Style ${style} failed with ${response.status}: ${errorText}`
    );
  }

  return (await response.json()) as SsProduct[];
}

export async function fetchSsActivewearCatalog(styles: string[]) {
  const markupRate = getMarkupRate();
  const exposeWholesale = process.env.SS_EXPOSE_WHOLESALE === "true";

  const cleanStyles = Array.from(
    new Set(styles.map((style) => style.trim()).filter(Boolean))
  );

  if (cleanStyles.length === 0) {
    throw new Error("At least one S&S style or part number is required.");
  }

  const settledResults = await Promise.allSettled(
    cleanStyles.map((style) => fetchProductsForStyle(style))
  );

  const products: SsProduct[] = [];
  const warnings: string[] = [];

  settledResults.forEach((result, index) => {
    const style = cleanStyles[index];

    if (result.status === "fulfilled") {
      products.push(...result.value);
      return;
    }

    warnings.push(
      result.reason instanceof Error
        ? result.reason.message
        : `Style ${style} could not be loaded.`
    );
  });

  if (products.length === 0) {
    throw new Error(
      warnings[0] || "S&S catalog did not return any products."
    );
  }

  return {
    source: "ss-activewear",
    generatedAt: new Date().toISOString(),
    markupRate,
    products: normalizeProducts(products, {
      markupRate,
      exposeWholesale,
    }),
    ...(warnings.length > 0 ? { warnings } : {}),
  } satisfies GorillaCatalogResponse;
}
