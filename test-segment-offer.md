# Segment Offer Integration Test Guide

## Setup

1. **Development Server**: Running on `http://localhost:3000`
2. **Ngrok Tunnel**: `https://317d94f4172a.ngrok-free.app`

## API Endpoints for Storefront Integration

### 1. Test Segment Offer (for development/testing)
**URL**: `https://317d94f4172a.ngrok-free.app/api/test-segment-offer`
**Method**: POST
**Headers**:
- `Authorization: Bearer <your-shopify-session-token>`
- `Content-Type: application/x-www-form-urlencoded`

**Body** (form data):
- `customerData`: Customer object as JSON string

**Example Customer Object**:
```json
{
  "id": 8064802095182,
  "email": "haidelimdi@gmail.com",
  "first_name": "Haider",
  "last_name": "Limdiwala",
  "name": "Haider Limdiwala",
  "cart": null,
  "tags": ["Vip"]
}
```

**Example Request**:
```
POST https://317d94f4172a.ngrok-free.app/api/test-segment-offer
Headers:
  Authorization: Bearer <your-shopify-session-token>
  Content-Type: application/x-www-form-urlencoded

Body:
  customerData={"id":8064802095182,"email":"haidelimdi@gmail.com","name":"Haider Limdiwala","tags":["Vip"]}
```

**Method**: GET
**Headers**:
- `Authorization: Bearer <your-shopify-session-token>`

**Query Parameters**:
- `customerData`: Customer object as JSON string (URL encoded)

**Example**:
```
GET https://317d94f4172a.ngrok-free.app/api/test-segment-offer?customerData=%7B%22id%22%3A8064802095182%2C%22email%22%3A%22haidelimdi%40gmail.com%22%2C%22name%22%3A%22Haider%20Limdiwala%22%2C%22tags%22%3A%5B%22Vip%22%5D%7D
Headers:
  Authorization: Bearer <your-shopify-session-token>
```

**Response**:
```json
{
  "offer": {
    "discountApplicable": true,
    "segment": "Vip",
    "planName": "VIP Discount Plan",
    "collections": [
      {
        "id": "gid://shopify/Collection/123",
        "title": "Drills",
        "handle": "drills",
        "percentOff": 15
      }
    ],
    "highestDiscountRate": 15
  },
  "customer": {
    "id": 8064802095182,
    "email": "haidelimdi@gmail.com",
    "name": "Haider Limdiwala",
    "tags": ["Vip"]
  }
}
```

### 2. Production Segment Offer (for storefront)
**URL**: `https://317d94f4172a.ngrok-free.app/api/segment-offer`
**Method**: POST
**Headers**:
- `Authorization: Bearer <your-shopify-session-token>`
- `Content-Type: application/x-www-form-urlencoded`

**Body**:
- `customerData`: Customer object as JSON string

## Storefront Integration

### JavaScript Example for Storefront
```javascript
// Get customer data from your storefront
const customer = {
  id: 8064802095182,
  email: "haidelimdi@gmail.com",
  name: "Haider Limdiwala",
  tags: ["Vip"]
};

// Call the segment offer API
async function getSegmentOffer(customer) {
  try {
    const response = await fetch('/api/segment-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Bearer <your-shopify-session-token>'
      },
      body: `customerData=${JSON.stringify(customer)}`
    });
    
    const data = await response.json();
    
    if (data.offer.discountApplicable) {
      // Show personalized offer to customer
      showOffer(data.offer);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching segment offer:', error);
  }
}

function showOffer(offer) {
  // Display offer to customer
  console.log(`You have a ${offer.highestDiscountRate}% discount on ${offer.collections.map(c => c.title).join(', ')}`);
}
```

## Testing Steps

### Step 1: Get Shopify Session Token
1. Open your Shopify app in the browser
2. Open browser DevTools → Network tab
3. Make any request to the app
4. Copy the `Authorization` header value from any request

### Step 2: Test with Customer Object
1. Prepare customer object with ID and tags
2. Use Postman or curl to test:
```bash
curl -X POST "https://317d94f4172a.ngrok-free.app/api/test-segment-offer" \
  -H "Authorization: Bearer <your-shopify-session-token>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "customerData={\"id\":8064802095182,\"email\":\"haidelimdi@gmail.com\",\"name\":\"Haider Limdiwala\",\"tags\":[\"Vip\"]}"
```

### Step 3: Verify Response
The response should show:
- `customer`: Customer information (id, email, name, tags)
- `offer.discountApplicable`: true/false
- `offer.segment`: segment ID if applicable
- `offer.planName`: plan name if applicable
- `offer.collections`: array of collections with discounts
- `offer.highestDiscountRate`: highest discount percentage

## Security Benefits

✅ **No Access Token Exposure**: Access tokens are never exposed in API requests
✅ **Session-Based Authentication**: Uses Shopify's secure session management
✅ **Automatic Token Refresh**: Shopify handles token refresh automatically
✅ **Secure by Default**: All endpoints require proper authentication
✅ **Customer Object Validation**: Validates customer data structure

## Expected Test Cases

1. **Customer with no tags**: Should return `discountApplicable: false`
2. **Customer with tags but no discount plans**: Should return `discountApplicable: false`
3. **Customer with tags and discount plans**: Should return full offer object
4. **Invalid customer object**: Should return `400 Bad Request`
5. **Unauthenticated request**: Should return `401 Unauthorized`

## Troubleshooting

- **401 Unauthorized**: Check your Shopify session token
- **400 Bad Request**: Missing or invalid `customerData` parameter
- **500 Internal Server Error**: Check server logs for details
- **Empty collections**: GraphQL query might have failed, check Shopify API permissions 