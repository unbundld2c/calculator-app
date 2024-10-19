import { Price, Calculator } from "../models/Calculator.js";
import clientProvider from "../../utils/clientProvider.js";
import mongoose from "mongoose";

// export const createVariant = async (req, res) => {
//   console.log("URL hit");

//   let { productId, height, width, price } = req.body;

//   if (!productId || !height || !width || price === undefined) {
//     return res.status(400).json({
//       error: "Missing required fields: productId, height, width, price",
//     });
//   }

//   try {
//     // Initialize the GraphQL client
//     const { client: graphqlClient } =
//       await clientProvider.offline.graphqlClient({
//         shop: res.locals.user_shop,
//       });

//     // Fetch product data from Shopify using GraphQL
//     const productData = await graphqlClient.request(
//       `{
//         product(id: "gid://shopify/Product/${productId}") {
//           id
//           title
//           options {
//             name
//             values
//           }
//           images(first: 1) {
//             edges {
//               node {
//                 src
//               }
//             }
//           }
//         }
//       }`
//     );

//     const product = productData.data.product;
//     if (!product) return res.status(404).json({ error: "Product not found" });

//     // Extract product options and image
//     const productOptions = product.options;
//     const imageURL = product.images.edges[0]?.node.src || null;

//     // Prepare variant data
//     const variantOptions = productOptions.map((option) => {
//       // Assuming you want to use the first value from the options
//       return option.values[0];
//     });

//     const optionsLength = product.options.length;
//     // console.log("*************************", optionsLength);

//     const generatedOptions = Array.from(
//       { length: optionsLength },
//       () => `cal-${new mongoose.Types.ObjectId().toString()}`
//     );

//     // Execute the GraphQL mutation
//     const variantResponse = await graphqlClient.request(
//       `mutation productVariantCreate($input: ProductVariantInput!) {
//         productVariantCreate(input: $input) {
//           product {
//             id
//           }
//           productVariant {
//             id
//             title
//           }
//           userErrors {
//             field
//             message
//           }
//         }
//       }`,
//       {
//         variables: {
//           input: {
//             price: String(price), // Correctly convert price to string
//             inventoryPolicy: "CONTINUE",
//             productId: `gid://shopify/Product/${productId}`,
//             options: generatedOptions, // Use existing option values
//           },
//         },
//       }
//     );
//     console.log("variant data", variantResponse.data.productVariantCreate);
//     // Handle GraphQL errors
//     if (variantResponse.data.productVariantCreate.userErrors.length > 0) {
//       return res.status(400).json({
//         error: "Failed to create variant",
//         details: variantResponse.data.productVariantCreate.userErrors,
//       });
//     }

//     // Extract the variant ID and return the response
//     const variantId =
//       variantResponse.data.productVariantCreate.productVariant.id.split(
//         "/ProductVariant/"
//       )[1];

//     res.status(201).json({ variantId }); // Return the price passed in
//   } catch (err) {
//     console.error("Error creating variant:", err);
//     if (err.body) {
//       console.error("GraphQL Errors:", err.body.errors);
//     }
//     res.status(500).json({ error: err.message });
//   }
// };

export const createVariant = async (req, res) => {
  console.log("url hit");
  let { productId, height, width } = req.body;
  // console.log(productId, "here");
  console.log(productId);
  let requestedArea = Number(height) * Number(width);
  const { client } = await clientProvider.offline.graphqlClient({
    shop: res.locals.user_shop,
  });
  let store = client.session.shop;

  try {
    // getting list of all calculators related to store
    let calculators = await Calculator.find({ store: store });
    // filtering out claculator that contains logic for product
    let productCalculator = calculators.find((calculator) => {
      const productString = `gid://shopify/Product/${productId}`;
      return (
        calculator.products.includes(productId) ||
        calculator.products.includes(productString)
      );
    });
    // getting pricings as per calculator
    let { pricing } = await Price.findById(productCalculator.price);
    // sorting pricing
    pricing = pricing
      .map((price) => ({
        area: Number(price.height) * Number(price.width),
        ...price,
      }))
      .sort((a, b) => a.area - b.area);
    // filtering price to calcualte
    let filteredPrice = pricing.find((price) => requestedArea <= price.area);
    let pricePerUnit = Number(filteredPrice._doc.price) / filteredPrice.area;
    let calculatedPrice = requestedArea * pricePerUnit;

    // making res request for variant
    const { client } = await clientProvider.offline.restClient({
      shop: store,
    });
    let productData = await client.get({
      path: `/products/${productId}`,
    });

    let options = productData.body.product.options;
    let imageURL = productData.body.product.image.src;
    let variantData = {
      price: calculatedPrice,
      image: imageURL,
      inventory_policy: "continue",
    };
    options.forEach((el, ind) => {
      variantData[`option${ind + 1}`] =
        `cal-${new mongoose.Types.ObjectId().toString()}`;
    });
    let data = await client.post({
      path: `/products/${productId}/variants`,
      data: {
        variant: variantData,
      },
    });
    res.json(data.body.variant).status(201);
  } catch (err) {
    res.json(err.message).status(501);
  }
};

export const returnPrices = async (req, res) => {
  let { productId } = req.body;
  console.log(productId, "here to get price");

  if (!productId) {
    return res.status(400).json({ error: "Missing required field: productId" });
  }

  const { client: graphqlClient } = await clientProvider.offline.graphqlClient({
    shop: res.locals.user_shop,
  });

  let store = graphqlClient.session.shop;

  try {
    // Fetch calculators related to the store
    let calculators = await Calculator.find({ store: store });

    // Find the calculator containing logic for the specified product
    let productCalculator = calculators.find((calculator) => {
      const productString = `gid://shopify/Product/${productId}`;
      return (
        calculator.products.includes(productId) ||
        calculator.products.includes(productString)
      );
    });

    if (!productCalculator) {
      return res
        .status(404)
        .json({ error: "Calculator not found for the product" });
    }

    // Get pricing data based on the calculator
    let { pricing } = await Price.findById(productCalculator.price);
    if (!pricing) {
      return res
        .status(404)
        .json({ error: "Pricing not found for the calculator" });
    }

    // Map and sort pricing data
    const priceData = pricing.map((price) => ({
      area: price.width * price.height,
      price: price.price,
    }));

    res.status(200).json({ price: priceData, calculator: productCalculator });
  } catch (err) {
    console.error("Error retrieving prices:", err);
    res.status(500).json({ error: err.message });
  }
};

// export const createProductVariant = async (req, res) => {
//   console.log("URL hit with GraphQL", req.body);

//   const { productId, height, width, color, price } = req.body;

//   if (!productId || !height || !width) {
//     return res
//       .status(400)
//       .json({ error: "Missing required fields: productId, height, width" });
//   }

//   try {
//     const { client: graphqlClient } =
//       await clientProvider.offline.graphqlClient({
//         shop: res.locals.user_shop,
//       });

//     // Retrieve product options from Shopify using GraphQL
//     const productData = await graphqlClient.request(
//       `{
//         product(id: "gid://shopify/Product/${productId}") {
//           id
//           title
//           options {
//             name
//             values
//           }
//           images(first: 1) {
//             edges {
//               node {
//                 src
//               }
//             }
//           }
//         }
//       }`
//     );

//     const product = productData.data.product;
//     if (!product) return res.status(404).json({ error: "Product not found" });

//     const productOptions = product.options;
//     const imageURL = product.images.edges[0]?.node.src; // Get the product's default image

//     // Prepare dynamic variant options (color, etc.)
//     const variantOptions = productOptions.map((option) => {
//       if (option.name.toLowerCase() === "color" && color) {
//         return color; // Use the color from the request
//       }
//       return `cal-${new mongoose.Types.ObjectId().toString()}`; // Generate unique values for other options
//     });

//     console.log("The new variant options", variantOptions);

//     // Execute the GraphQL mutation
//     const variantResponse = await graphqlClient.request(
//       `mutation createProductVariant($input: ProductVariantInput!) {
//         productVariantCreate(input: $input) {
//           productVariant {
//             id
//             title
//             price
//             inventoryPolicy
//           }
//           userErrors {
//             field
//             message
//           }
//         }
//       }
//     `,
//       {
//         variables: {
//           input: {
//             price: String(price),
//             inventoryPolicy: "CONTINUE",
//             productId: `gid://shopify/Product/${productId}`,
//             options: variantOptions,
//             // imageSrc: imageURL, // Set the image if available
//           },
//         },
//       }
//     );

//     const variantData =
//       variantResponse.data.productVariantCreate.productVariant;

//     if (variantResponse.data.productVariantCreate.userErrors.length > 0) {
//       return res.status(400).json({
//         error: "Failed to create variant",
//         details: variantResponse.data.productVariantCreate.userErrors,
//       });
//     }

//     // Send back the created variant's ID
//     const variantId = variantData.id.split("/ProductVariant/")[1];
//     res.status(201).json({ variantId }); // Return the variant ID
//   } catch (err) {
//     console.error("Error creating product variant:", err);
//     if (err.body) {
//       console.error("GraphQL Errors:", err.body.errors);
//     }
//     res.status(500).json({ error: err.message });
//   }
// };

export const createProductVariant = async (req, res) => {
  console.log("URL hit with GraphQL", req.body);

  const { productId, height, width, color, price } = req.body;

  if (!productId || !height || !width) {
    return res
      .status(400)
      .json({ error: "Missing required fields: productId, height, width" });
  }

  try {
    // Create GraphQL client for offline access
    const { client: graphqlClient } =
      await clientProvider.offline.graphqlClient({
        shop: res.locals.user_shop,
      });

    // Fetch product details using GraphQL
    const productData = await graphqlClient.request(`
      query {
        product(id: "gid://shopify/Product/${productId}") {
          id
          title
          options {
            name
            values
          }
          images(first: 1) {
            edges {
              node {
                src
              }
            }
          }
        }
      }
    `);

    const product = productData.product;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const productOptions = product.options;

    // Calculate requested area (height * width)
    const requestedArea = Number(height) * Number(width);

    // Retrieve pricing logic related to the product (custom logic)
    let calculators = await Calculator.find({ store: res.locals.user_shop });
    let productCalculator = calculators.find((calculator) => {
      const productString = `gid://shopify/Product/${productId}`;
      return (
        calculator.products.includes(productId) ||
        calculator.products.includes(productString)
      );
    });

    if (!productCalculator) {
      return res
        .status(404)
        .json({ error: "Pricing logic not found for the product" });
    }

    let { pricing } = await Price.findById(productCalculator.price);
    pricing = pricing
      .map((price) => ({
        area: Number(price.height) * Number(price.width),
        ...price,
      }))
      .sort((a, b) => a.area - b.area);

    // Calculate price based on area
    let filteredPrice = pricing.find((price) => requestedArea <= price.area);
    let pricePerUnit = Number(filteredPrice.price) / filteredPrice.area;
    let calculatedPrice = requestedArea * pricePerUnit;

    // Prepare variant options dynamically
    const variantOptions = productOptions.map((option) => {
      if (option.name.toLowerCase() === "color" && color) {
        return color; // Use provided color if available
      }
      return `cal-${new mongoose.Types.ObjectId().toString()}`; // Generate unique option value for others
    });

    console.log("The new variant options:", variantOptions);

    // Create product variant using GraphQL mutation
    const variantResponse = await graphqlClient.request(
      `mutation createProductVariant($input: ProductVariantInput!) {
        productVariantCreate(input: $input) {
          productVariant {
            id
            title
            price
            inventoryPolicy
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        input: {
          price: String(calculatedPrice),
          inventoryPolicy: "CONTINUE",
          productId: `gid://shopify/Product/${productId}`,
          options: variantOptions,
        },
      }
    );

    const variantData = variantResponse.data.productVariantCreate.productVariant;

    if (variantResponse.data.productVariantCreate.userErrors.length > 0) {
      return res.status(400).json({
        error: "Failed to create variant",
        details: variantResponse.data.productVariantCreate.userErrors,
      });
    }

    // Send back the created variant's ID
    const variantId = variantData.id.split("/ProductVariant/")[1];
    res.status(201).json({ variantId });
  } catch (err) {
    console.error("Error creating product variant:", err);
    if (err.body) {
      console.error("GraphQL Errors:", err.body.errors);
    }
    res.status(500).json({ error: err.message });
  }
};
