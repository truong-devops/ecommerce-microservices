# Local ELK Stack

This folder contains local Docker Compose configuration for collecting ecommerce service logs with Filebeat, parsing them with Logstash, storing them in Elasticsearch, and searching them in Kibana.

## Start

```bash
docker compose -f docker-compose.yml -f docker-compose.elk.yml up -d --build
```

Kibana:

```txt
http://localhost:5601
```

Elasticsearch:

```txt
http://localhost:9200
```

## Kibana Data View

Create a data view:

```txt
ecommerce-logs-local-*
```

Useful fields:

```txt
service
level
event_action
request_id
method
path
status
duration_ms
client_ip
app_message
```

## Test

Generate a request through the API Gateway:

```bash
curl -H "X-Request-ID: local-elk-test-1" http://localhost:12000/health
```

Then search in Kibana:

```txt
request_id : "local-elk-test-1"
```

Or verify directly in Elasticsearch:

```bash
curl -fsS -H 'Content-Type: application/json' \
  'http://localhost:9200/ecommerce-logs-local-*/_search?pretty' \
  -d '{"size":5,"query":{"term":{"request_id.keyword":"local-elk-test-1"}},"sort":[{"@timestamp":"desc"}]}'
```

## Notes

- Elasticsearch may show `yellow` health locally because this stack runs a single node and replica shards cannot be assigned.
- Filebeat sends logs to Logstash, so Filebeat warnings about Elasticsearch ingest pipelines can be ignored for this local stack.
- `event_action` is used instead of `event` to avoid conflicts with the Elastic Common Schema `event` object.
