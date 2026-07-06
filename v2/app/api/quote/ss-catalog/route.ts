# S&S Activewear API credentials
# Do not commit your real .env.local file to GitHub.

SS_ACCOUNT_NUMBER=your_ss_account_number_here
SS_API_KEY=your_ss_api_key_here

# 0.4 = 40% markup over your S&S customer/wholesale price.
SS_MARKUP_RATE=0.4

# Comma-separated styles to test first.
# Examples: Bella+Canvas 3001CVC, Gildan 5000
SS_DEFAULT_STYLES=3001CVC,5000

# Keep this false for customer-facing use.
# If true, API responses may include wholesale cost for debugging.
SS_EXPOSE_WHOLESALE=false
