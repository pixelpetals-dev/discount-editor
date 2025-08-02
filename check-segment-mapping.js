import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSegmentMapping() {
  try {
    console.log('🔍 Checking segment mapping...\n');
    
    // Get all discount plans
    const plans = await prisma.discountPlan.findMany({
      where: { targetType: "segment" },
      include: { rules: true }
    });
    
    console.log(`📊 Found ${plans.length} segment discount plans:\n`);
    
    plans.forEach((plan, index) => {
      console.log(`Plan ${index + 1}:`);
      console.log(`  Name: ${plan.name}`);
      console.log(`  Target Key: ${plan.targetKey}`);
      
      // Try to extract segment ID from GID
      if (plan.targetKey.startsWith('gid://shopify/Segment/')) {
        const segmentId = plan.targetKey.replace('gid://shopify/Segment/', '');
        console.log(`  Extracted Segment ID: ${segmentId}`);
      }
      
      console.log(`  Rules: ${plan.rules.length}`);
      console.log('');
    });
    
    // Get all segments
    const segments = await prisma.segment.findMany();
    console.log(`📊 Found ${segments.length} segments in local DB:\n`);
    segments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}:`);
      console.log(`  ID: ${segment.id}`);
      console.log('');
    });
    
    // Test the mapping logic
    console.log('🧪 Testing mapping logic for customer tag "Vip":\n');
    const customerTag = 'vip';
    const customerTags = [customerTag];
    
    console.log(`Customer tag: "${customerTag}"`);
    console.log(`Customer tags (lowercase): ${customerTags}`);
    
    // Test different strategies
    const strategies = [
      { name: 'Exact match', value: customerTags },
      { name: 'GID format', value: customerTags.map(tag => `gid://shopify/Segment/${tag}`) },
      { name: 'Uppercase', value: customerTags.map(tag => tag.toUpperCase()) },
      { name: 'Capitalized', value: customerTags.map(tag => tag.charAt(0).toUpperCase() + tag.slice(1)) },
      { name: 'Contains match', value: customerTags[0] }
    ];
    
    for (const strategy of strategies) {
      console.log(`\nTesting ${strategy.name}:`);
      
      let query;
      if (strategy.name === 'Contains match') {
        query = {
          where: {
            targetType: "segment",
            targetKey: { contains: strategy.value }
          }
        };
      } else {
        query = {
          where: {
            targetType: "segment",
            targetKey: { in: strategy.value }
          }
        };
      }
      
      const results = await prisma.discountPlan.findMany(query);
      console.log(`  Found ${results.length} plans`);
      
      if (results.length > 0) {
        results.forEach(plan => {
          console.log(`    - ${plan.name} (${plan.targetKey})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSegmentMapping(); 