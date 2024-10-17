import { Price, Calculator } from "../models/Calculator.js";
import clientProvider from "../../utils/clientProvider.js";
import mongoose from "mongoose";

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
    let productCalculator = calculators.find((calculator) =>
      calculator.products.join(",").includes(productId)
    );
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
      variantData[`option${ind + 1}`] = `cal-${new mongoose.Types.ObjectId().toString()}`;
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
  console.log(productId, "here get price");
  const { client } = await clientProvider.offline.graphqlClient({
    shop: res.locals.user_shop,
  });
  let store = client.session.shop;
  let productString = `gid://shopify/Product/${productId}`;
  try {
    // getting list of all calculators related to store
    let calculators = await Calculator.find({ store: store });
    console.log("calculators all", calculators);
    // filtering out claculator that contains logic for product
    let productCalculator = calculators.find((calculator) => {
      const productString = `gid://shopify/Product/${productId}`;
      return calculator.products.includes(productId) || calculator.products.includes(productString);
    });
    console.log("calculators product", productCalculator);
    // getting pricings as per calculator
    let { pricing } = await Price.findById(productCalculator.price);
    // console.log("price product", pricing);
    // sorting pricing
    const priceData = pricing.map((price) => ({
      area: price.width * price.height,
      price: price.price,
    }));
    res.json({ price: priceData, calculator: productCalculator }).status(200);
  } catch (err) {
    res.json(err.message).status(501);
  }
};


export const createProductVariant = async (req, res) => {
  console.log("URL hit 2");

  const { productId, height, width, color } = req.body; // Added color from request
  const requestedArea = Number(height) * Number(width);

  try {
    const { client } = await clientProvider.offline.graphqlClient({
      shop: res.locals.user_shop,
    });
    const store = client.session.shop;

    // Retrieve all calculators related to the store
    const calculators = await Calculator.find({ store: store });
    // Find the calculator that contains the product logic
    const productCalculator = calculators.find((calculator) =>
      calculator.products.includes(productId)
    );
    if (!productCalculator) throw new Error("Calculator not found for product");

    // Retrieve pricing based on the product's calculator
    let { pricing } = await Price.findById(productCalculator.price);

    // Sort pricing by area (height * width)
    pricing = pricing
      .map((price) => ({
        area: Number(price.height) * Number(price.width),
        ...price,
      }))
      .sort((a, b) => a.area - b.area);

    // Find the appropriate pricing based on requested area
    const filteredPrice = pricing.find((price) => requestedArea <= price.area);
    if (!filteredPrice) throw new Error("No price available for this size");

    const pricePerUnit = Number(filteredPrice.price) / filteredPrice.area;
    const calculatedPrice = requestedArea * pricePerUnit;

    // Make REST request to Shopify for the product
    const restClient = await clientProvider.offline.restClient({ shop: store });
    const productData = await restClient.get({
      path: `/products/${productId}`,
    });

    const productOptions = productData.body.product.options; // Get product options
    const imageURL = productData.body.product.image.src; // Default product image

    // Prepare variant data
    let variantData = {
      price: calculatedPrice,
      image: imageURL,
      inventory_policy: "continue",
    };

    // Dynamically assign options (e.g., height, width, color)
    productOptions.forEach((option, index) => {
      if (option.name.toLowerCase() === "color" && color) {
        variantData[`option${index + 1}`] = color; // Add color from request
      } else {
        variantData[`option${index + 1}`] = `cal-${new mongoose.Types.ObjectId().toString()}`;
      }
    });

    // Create the new variant for the product
    const variantResponse = await restClient.post({
      path: `/products/${productId}/variants`,
      data: { variant: variantData },
    });

    res.status(201).json(variantResponse.body.variant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
