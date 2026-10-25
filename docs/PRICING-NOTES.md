# Residential estimate assumptions

Updated 2026-10-22. The user requested $40/hour for standard cleaning and $50/hour
for deep cleaning. The preview uses a single crew rate, without multiplying by
the two people. This billing basis and the duration allowances need final owner
approval. Commercial and Airbnb remain assessment-based, as agreed in
[PROJECT-SCOPE.md](PROJECT-SCOPE.md).

## Local reference points

Reviewed publicly indexed company pricing on 2026-10-22:

- [Valen's Cleaning Services](https://www.valenscleaningservices.com/) advertises
  standard cleaning for a 1–2 bedroom home starting at $160, deep cleaning starting
  at $300, and move-in/out starting at $200.
- [Prestige Home Cleaning](https://cleanmyprestigehome.com/house-cleaning/) lists
  its Essential Refresh at $60/hour, with a two-hour minimum and five-hour maximum.
  This is a limited partial-home service with one cleaning technician, so it is
  not directly equivalent to this crew's full-home scope.

These are advertised examples, not a measured Shreveport average or binding
competitor quotes. Rates, inclusions, and staffing differ. The user-supplied
hourly rates drive this calculator; the references provide context rather than
an automatic market-price multiplier. Do not publish claims of being cheapest
or matching a citywide average based on these examples.

## Display calculation

1. Standard time allowance = 1.5 hours for common areas + 0.25 per bedroom +
   0.5 per full bathroom + 0.25 per half bathroom + 0.5 per additional 500 sq ft
   above 1,000 sq ft (proportional before rounding).
2. Multiply that allowance by 1 for standard, 1.5 for deep, or 1.75 for move-in/out.
   Round the resulting time up to the next quarter hour.
3. Multiply estimated time by $40 for standard or $50 for deep/move-in-out.
4. Apply the existing frequency adjustment: weekly 20%, every two weeks 15%,
   monthly 10%, one-time 0%. Round monetary lines to cents.
5. Bring the cleaning amount to the existing $110 minimum if necessary, then add
   the unchanged selected extras. The summary displays a minimum adjustment
   whenever the floor applies.

Time allowances are implementation assumptions for planning, not published
productivity research or a promised duration. Calibrate them using timed jobs and
owner review. Extras are priced separately and do not also increase base-cleaning
hours; this avoids charging twice for the same work. Pets Yes/No records scope
only. The optional $35 pet-hair detailing extra remains an explicit selection.
Visible buildup or heavy condition still requires assessment instead of an
invented surcharge or an incomplete online price.

For 1,800 sq ft, 3 bedrooms, 2 full bathrooms and 1 half bathroom, routine condition,
one-time service and no extras:

| Cleaning level | Estimated hours | Hourly rate | Estimate |
| --- | --- | --- | --- |
| Standard | 4.50 | $40 | $180.00 |
| Deep | 6.50 | $50 | $325.00 |
| Move-in/out | 7.75 | $50 | $387.50 |

The same standard example every two weeks is $153.00 before extras. A single
fridge adds $65, for $218.00. Small jobs may hit the $110 minimum.

## Required answers

Service and frequency still start unanswered. Scope dropdowns have been replaced
with radio choices containing only real answers. Pets has explicit Yes/No
choices. Every active unanswered required group gets a red border/glow and a
written instruction, plus an accessible invalid state. Once answered, its
highlight clears. Optional extras are never marked as missing answers. The
summary names the remaining questions instead of leaving a blank price unexplained.

Customer intake and network submission remain disabled. Browser calculations,
copied summaries and request-selection snapshots are not authoritative quotes
or appointments; future server code must validate and recalculate separately.
