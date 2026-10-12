# NoMoreNarrowRoom data collection rule v1

## 1. What the user sees first
The primary room-size number is the minimum size of the cheapest/base room a normal traveler is likely to book.

Example:
- Standard Double 15㎡
- Moderate Double 18㎡
- Twin 24㎡

The hotel card shows **15㎡** as the main room-size metric. Larger room types remain available on the hotel detail page.

## 2. Candidate discovery
Use Korean traveler demand to decide which hotels deserve to be in the database first.

Priority discovery sources:
1. 네일동 and similar Korean Japan-travel communities: repeated mentions, recommendation questions, stay reviews
2. Naver Blog/Cafe search: repeated hotel names and recent interest
3. Existing Passivelab hotel keyword/content data

Community content is used to discover and rank hotel candidates, not as the authoritative source for room size or facilities.

## 3. Fact verification
Verify hard facts with hotel official sources first, OTA pages second.

For each hotel collect:
- Korean / English hotel name
- city and area
- address and coordinates
- cheapest/base room name
- minimum room area (sqm)
- other major room types and areas
- maximum guests
- public bath / sauna
- laundry
- bath/toilet separation
- nearest station and walking time
- official URL
- OTA URL if used for booking comparison
- verification date
- source URL

## 4. Popularity signal
Store demand signals separately from verified hotel facts.

Useful fields:
- mention count
- unique author count
- stay-review count
- recommendation count
- recency

Do not copy community post text into the product database. Use mentions only as a popularity/candidate signal.

## 5. First market
Start with Fukuoka and manually curate roughly 30–50 hotels before automating ingestion.

Initial area buckets:
- 하카타
- 텐진
- 나카스

The goal of the first dataset is not completeness. It is to test whether Korean travelers actually use minimum-room-size + public-bath + area filters before booking.
