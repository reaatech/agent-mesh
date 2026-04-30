import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { env } from '@reaatech/agent-mesh';
import { SERVICE_NAME, SERVICE_VERSION } from '@reaatech/agent-mesh';

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'unknown',
});

const instrumentations = [new HttpInstrumentation(), new ExpressInstrumentation()];

let _sdk: NodeSDK | null = null;

export function initOtel(): NodeSDK | null {
  if (_sdk) {
    return _sdk;
  }

  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return null;
  }

  _sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations,
  });

  _sdk.start();
  return _sdk;
}

export async function shutdownOtel(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    _sdk = null;
  }
}
