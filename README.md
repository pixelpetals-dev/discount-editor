# Shopify Segment-Based Discount App

A Shopify application that automatically applies discounts to customers based on their segments and product collections, then creates draft orders with the discounted prices.

## 🎯 **What This App Does**

### **Core Functionality**
This app creates a **secure proxy system** that:
1. **Checks customer segments** - Identifies which customer segment a customer belongs to (VIP, Gold, etc.)
2. **Applies collection-based discounts** - Finds products in specific collections and applies percentage discounts
3. **Creates draft orders** - Automatically generates Shopify draft orders with the discounted prices
4. **Returns draft order URLs** - Provides direct links to complete the purchase with discounts applied

### **How It Works**
```
Customer Cart → Check Segment → Find Discount Rules → Apply Discounts → Create Draft Order → Return URL
```

## 🏗️ **Architecture Overview**

### **Database Schema**
```sql
-- Discount Plans (e.g., "VIP Customer Discount")
DiscountPlan (id, name, targetType, targetKey, createdAt, updatedAt)

-- Discount Rules (e.g., "15% off Collection A")
Rule (id, categoryId, percentOff, discountPlanId)

-- Customer Data
Customer (id, email)
Segment (id) 
CustomerSegment (customerId, segmentId)

-- Shopify App Sessions
Session (id, shop, accessToken, scope, expires, isOnline)
```

### **Key Components**
- **Remix Framework**: Server-side rendering and API routes
- **Shopify Admin API**: Fetches customer data, segments, and collections
- **Prisma ORM**: Database operations with PostgreSQL
- **Vercel Deployment**: Serverless hosting with automatic scaling
- **CORS Support**: Cross-origin requests for storefront integration

## 🚀 **Main API Endpoint**

### **`POST /api/check-segment-discount`**
This is the **primary endpoint** that handles the entire discount workflow:

**Request Body:**
```json
{
  "shop": "your-store.myshopify.com",
  "customerId": "gid://shopify/Customer/123456789",
  "cartItems": {
    "items": [
      {
        "product_id": 123456789,
        "variant_id": "gid://shopify/ProductVariant/987654321",
        "quantity": 2,
        "price": 5000,
        "title": "Product Name"
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "isDraft": true,
  "draftOrderUrl": "https://your-store.myshopify.com/admin/draft_orders/123456789",
  "discountSummary": {
    "discountApplicable": true,
    "segment": "VIP",
    "planName": "VIP Customer Discount",
    "totalOriginalPrice": 100.00,
    "totalDiscountAmount": 15.00,
    "savingsPercentage": 15.0,
    "applicableDiscounts": [...]
  }
}
```

## 🔧 **Setup Instructions**

### **1. Database Setup**
Run these SQL queries in your PostgreSQL database:

```sql
-- Create all tables
CREATE TABLE "DiscountPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscountPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "percentOff" DOUBLE PRECISION NOT NULL,
    "discountPlanId" TEXT NOT NULL,
    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSegment" (
    "customerId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("customerId", "segmentId")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_discountPlanId_fkey" FOREIGN KEY ("discountPlanId") REFERENCES "DiscountPlan"("id") ON DELETE CASCADE;
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id");
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id");
```

### **2. Environment Variables**
Set these in your Vercel deployment:

```bash
POSTGRES_URL=postgresql://username:password@host:port/database
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-app.vercel.app
```

### **3. Shopify App Configuration**
- **App URL**: Your Vercel deployment URL
- **Embedded**: `true`
- **Scopes**: `read_customers`, `write_draft_orders`, `write_products`

## 📊 **How to Use**

### **Step 1: Create Discount Plans**
1. Install the app in your Shopify store
2. The app will automatically fetch your customer segments
3. Create discount plans targeting specific segments

### **Step 2: Add Discount Rules**
For each discount plan, add rules like:
- **Collection**: "Electronics"
- **Discount**: 15% off
- **Segment**: "VIP Customers"

### **Step 3: Test the Integration**
Call the API from your storefront:

```javascript
// Example storefront integration
fetch('https://your-app.vercel.app/api/check-segment-discount', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    shop: 'your-store.myshopify.com',
    customerId: 'gid://shopify/Customer/123456789',
    cartItems: {
      items: [
        {
          product_id: 123456789,
          variant_id: 'gid://shopify/ProductVariant/987654321',
          quantity: 2,
          price: 5000,
          title: 'Product Name'
        }
      ]
    }
  })
})
.then(response => response.json())
.then(data => {
  if (data.success && data.draftOrderUrl) {
    // Redirect customer to draft order
    window.location.href = data.draftOrderUrl;
  }
});
```

## 🔍 **API Endpoints**

### **Primary Endpoints**
- `POST /api/check-segment-discount` - Main discount checking and draft order creation
- `POST /api/create-draft-order` - Direct draft order creation
- `GET /api/debug-discount` - Debug discount plans and segments

### **Utility Endpoints**
- `GET /api/test-cors` - Test CORS headers
- `POST /api/cart-test` - Test cart processing
- `GET /api/shopify-data` - Universal Shopify data endpoint

## 🛠️ **Technical Details**

### **Security Features**
- **Secure Proxy Pattern**: Backend handles all Shopify API calls
- **No Token Exposure**: Access tokens never sent to frontend
- **CORS Support**: Proper headers for cross-origin requests
- **Session Management**: Secure session storage with Prisma

### **Shopify Integration**
- **Admin API**: Fetches customer segments and product collections
- **GraphQL**: Efficient data queries for customer and product data
- **Draft Orders**: Creates orders with applied discounts
- **Embedded App**: Runs within Shopify admin interface

### **Database Operations**
- **Customer Lookup**: Finds customer by ID and fetches tags
- **Segment Matching**: Matches customer tags to Shopify segments
- **Collection Checking**: Verifies products belong to discount collections
- **Session Storage**: Stores Shopify access tokens securely

## 🚨 **Troubleshooting**

### **Common Issues**

**1. "Failed to create draft order"**
- Check if customer exists in Shopify
- Verify access token is valid
- Ensure product variants are correct

**2. "No matching segment found"**
- Verify customer has correct tags
- Check segment exists in Shopify
- Ensure discount plan targets correct segment

**3. "X-Frame-Options error"**
- App is properly configured for embedded use
- CORS headers are set correctly
- CSP headers allow Shopify admin

### **Debug Tools**
- `/api/debug-discount` - View all discount plans and segments
- Browser console - Check for JavaScript errors
- Vercel logs - Server-side error tracking

## 📈 **Example Workflow**

1. **Customer adds products to cart**
2. **Storefront calls API** with customer ID and cart items
3. **App checks customer segments** (VIP, Gold, etc.)
4. **App finds applicable discounts** for product collections
5. **App creates draft order** with discounts applied
6. **App returns draft order URL** for customer to complete purchase
7. **Customer clicks URL** and completes purchase with discounts

## 🔄 **Deployment**

### **Vercel Deployment**
```bash
# Deploy to Vercel
vercel --prod

# Set environment variables
vercel env add POSTGRES_URL
vercel env add SHOPIFY_API_KEY
vercel env add SHOPIFY_API_SECRET
vercel env add SHOPIFY_APP_URL
```

### **Database Migration**
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

## 📞 **Support**

For issues or questions:
1. Check the troubleshooting section
2. Review Vercel deployment logs
3. Test with the debug endpoints
4. Verify Shopify app configuration

---

**Built with Remix, Shopify App Platform, Prisma, and Vercel**
