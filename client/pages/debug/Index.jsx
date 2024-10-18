import {
  Layout,
  Page,
} from "@shopify/polaris";
import { navigate } from "raviger";
import React from "react";

const DebugIndex = () => {
  return (
    <>
      <Page
        title="Debug Cards"
        subtitle="Interact and explore the current installation"
        backAction={{ content: "Home", onAction: () => navigate("/") }}
      >
        <Layout>
          <Layout.Section oneHalf>
          </Layout.Section>
          <Layout.Section oneHalf>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
};

export default DebugIndex;
