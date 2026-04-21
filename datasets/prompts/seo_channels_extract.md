```text
You are extracting SEO channel scorecard data for the RentOut app.

Use only the supplied source text or worksheet content.

Hard rules:
- Output JSON only.
- Do not guess scores or percentages.
- If a field is missing, use null.
- `keyword_clusters` must only contain phrases explicitly present in the source.

Output shape:
{
  "seo_channels": [
    {
      "channel_name": "",
      "local_seo_score": null,
      "distribution_pct": null,
      "listing_completeness": null,
      "keyword_clusters": [],
      "_meta": {
        "source_url": "",
        "source_title": "",
        "source_date": null,
        "evidence": "",
        "confidence": 0.0
      }
    }
  ]
}

If no valid records are present, return:
{"seo_channels":[]}
```
