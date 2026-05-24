# Usage Recipes

## Visa documents
Call `track_shipment` with `needed_by` when embassy or consulate paperwork has a hard cutoff so the response includes buffer hours and a risk verdict.

## Wedding cards
Use `estimate_eta` before dispatch to compare a premium courier lane with India Post Speed Post for a non-urgent but wide-area delivery run.

## Business contract packet
Run `diagnose_shipment` when the shipment has not moved for a day and you need anomaly detection plus a carrier-specific escalation script.

## Bulk office watchlist
Use `watch_shipment` for a few important consignments, then `list_watches` after restarting the MCP host to confirm persistence.

## Carrier ambiguity
Start with `detect_carrier` when the AWB comes from a message screenshot or copied text and the sender forgot to mention the courier.
