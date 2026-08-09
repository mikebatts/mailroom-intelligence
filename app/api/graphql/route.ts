// GraphQL endpoint serving the sample set, cached extractions, and eval stats.
// Mirrors the shape Stable uses in production (React + GraphQL + Node).
import { createSchema, createYoga } from "graphql-yoga";
import samples from "@/data/samples.json";
import extractions from "@/data/extractions.json";
import evalStats from "@/data/eval.json";

const typeDefs = /* GraphQL */ `
  type FieldString { value: String, confidence: Float! }
  type FieldFloat { value: Float, confidence: Float! }

  type Extraction {
    docType: FieldString!
    sender: FieldString!
    recipient: FieldString!
    amount: FieldFloat!
    keyDate: FieldString!
    urgency: FieldString!
    summary: String!
    recommendedAction: String!
    overallConfidence: Float!
  }

  type ExtractionRecord {
    sampleId: String!
    model: String!
    extraction: Extraction!
    latencyMs: Int!
    inputTokens: Int!
    outputTokens: Int!
    costUsd: Float!
  }

  type MailSample { id: String!, file: String!, label: String! }

  type ModelStats {
    model: String!
    n: Int!
    docType: Float!, sender: Float!, recipient: Float!, amount: Float!, keyDate: Float!, action: Float!
    routingSafe: Float!
    autoRate: Float!
    meanLatencyMs: Int!
    costPerDocUsd: Float!
  }

  type Query {
    samples: [MailSample!]!
    extractions(model: String): [ExtractionRecord!]!
    evalStats: [ModelStats!]!
  }
`;

const schema = createSchema({
  typeDefs,
  resolvers: {
    Query: {
      samples: () => samples,
      extractions: (_: unknown, args: { model?: string }) =>
        args.model ? extractions.filter((e) => e.model === args.model) : extractions,
      evalStats: () => evalStats,
    },
  },
});

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

const handler = (request: Request) => yoga.handleRequest(request, {});

export { handler as GET, handler as POST, handler as OPTIONS };
