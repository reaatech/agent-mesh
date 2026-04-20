/**
 * OpenTelemetry SDK initialization
 * Must be imported first (before any other module) to instrument correctly
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { env } from '../config/env.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../config/constants.js';

/** Resource identifying this service */
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'unknown',
});

/** Trace exporter (OTLP gRPC) */
const traceExporter = env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    })
  : undefined;

/** Span processor */
const spanProcessor = traceExporter ? new SimpleSpanProcessor(traceExporter) : undefined;

/** Instrumentations */
const instrumentations = [new HttpInstrumentation(), new ExpressInstrumentation()];

/** Global SDK instance (lazy initialized) */
let _sdk: NodeSDK | null = null;

/**
 * Initialize the OpenTelemetry SDK
 * Call this at the very start of your application
 */
export function initOtel(): NodeSDK | null {
  if (_sdk) {
    return _sdk;
  }

  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // No OTLP endpoint configured, skip OTEL initialization
    return null;
  }

  _sdk = new NodeSDK({
    resource,
    spanProcessor: spanProcessor!,
    instrumentations,
  });

  _sdk.start();
  return _sdk;
}

/**
 * Shutdown the OTEL SDK gracefully
 */
export async function shutdownOtel(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    _sdk = null;
  }
}
