# PropertyWise NZ Legal Consultation - 完整升级指南

🎉 **恭喜！现在升级到专业法律咨询服务！**

## 📋 新业务模式：房产法律咨询

### 🎯 服务定位升级
**从：** AI房屋检查报告 ($49)  
**到：** 专业房产法律咨询 ($149-499)

### 📄 核心服务
- **Purchase Agreement 分析** - 合同条款审查
- **LIM Report 解读** - 土地信息报告分析  
- **Building Inspection 评估** - 建筑检验报告解读
- **法律风险评估** - 综合购房决策建议

## 🔧 升级内容

### ✨ 全新专业设计
- **品牌重塑：** PropertyWise NZ（专业法律咨询）
- **设计风格：** 深蓝色+金色，体现法律专业性
- **字体选择：** Crimson Text（法律风格）+ Montserrat
- **专业图标：** ⚖️ 法律象征

### 📁 新文件结构
```
propertywise-nz/
├── propertywise-nz.html           # 主页面 - 法律咨询服务
├── propertywise-package.json      # 依赖管理 
├── propertywise-vercel.json       # 部署配置
├── api/
│   ├── legal-consultation.js      # Stripe 支付处理
│   ├── legal-document-upload.js   # PDF文档上传处理
│   └── legal-webhook.js           # 支付事件处理
└── .env.template                  # 环境变量模板
```

### 💰 新定价结构
- **Essential Review:** $149 NZD - 单文档分析
- **Complete Analysis:** $299 NZD - 全套文档分析 + 咨询电话
- **Premium Consultation:** $499 NZD - 优先处理 + 全面支持

## 🚀 部署步骤

### 步骤 1: 替换现有文件

1. **备份当前版本**
```bash
# 创建备份分支
git checkout -b backup-house-inspection
git push origin backup-house-inspection
```

2. **替换主要文件**
```bash
# 将 propertywise-nz.html 重命名为 index.html
mv propertywise-nz.html index.html

# 更新配置文件
mv propertywise-package.json package.json
mv propertywise-vercel.json vercel.json
```

### 步骤 2: 更新 Stripe 配置

1. **创建新的 Stripe 产品**
   - 访问 Stripe Dashboard
   - 创建产品："PropertyWise NZ Legal Consultation"
   - 设置价格：$149, $299, $499 NZD

2. **更新 Webhook 端点**
   ```
   URL: https://propertywise.co.nz/api/legal-webhook
   Events: checkout.session.completed, payment_intent.succeeded
   ```

### 步骤 3: 配置环境变量

在 Vercel Dashboard 中设置：
```bash
# Stripe 配置
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_SECRET_KEY=sk_live_your_key  
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# 邮件服务（可选）
SENDGRID_API_KEY=your_sendgrid_key
LEGAL_TEAM_EMAIL=legal@propertywise.co.nz

# 应用配置
NODE_ENV=production
```

### 步骤 4: 更新网站内容

在 `index.html` 中替换 Stripe 公钥：
```javascript
// 找到这行
const stripe = Stripe('pk_test_YOUR_PUBLISHABLE_KEY_HERE');

// 替换为你的真实密钥
const stripe = Stripe('pk_live_your_actual_key_here');
```

## 📊 功能对比

| 功能 | 原版本（房屋检查） | 新版本（法律咨询） |
|------|-------------------|-------------------|
| **服务类型** | 照片分析 | 法律文档分析 |
| **文件类型** | JPG, PNG, HEIC | PDF, DOCX |
| **分析内容** | 建筑状况 | 法律风险、合同条款 |
| **定价** | $49 | $149-499 |
| **处理时间** | 即时 | 12-48小时 |
| **输出** | 分析结果 | 专业法律报告 |

## 🧪 测试指南

### 测试法律咨询流程

1. **文档上传测试**
   - 上传PDF格式的Purchase Agreement
   - 验证文档类型检测功能
   - 确认文本提取正常工作

2. **支付流程测试**
   ```
   测试卡号: 4242 4242 4242 4242
   过期日期: 12/25
   CVC: 123
   ```

3. **验证工作流程**
   - [ ] 文档上传和类型识别
   - [ ] 三种套餐支付流程
   - [ ] Webhook事件接收
   - [ ] 确认邮件发送
   - [ ] 法律团队通知

### 监控要点

- **文档处理：** 检查PDF文本提取质量
- **支付转化：** 监控各套餐的选择率  
- **客户满意度：** 跟踪服务质量评分
- **法律合规：** 确保免责声明清晰

## 🔒 法律合规

### 重要免责声明
网站已包含专业法律免责声明：
> "PropertyWise NZ provides AI-powered analysis and recommendations for informational purposes only. Our service does not constitute formal legal advice..."

### 合规要求
- ✅ 明确标明"非正式法律建议"
- ✅ 建议客户咨询执业律师
- ✅ 包含新西兰企业注册号
- ✅ 隐私政策和服务条款链接

## 📈 业务优势

### 价值提升
1. **客单价提升：** $49 → $149-499 (3-10倍)
2. **专业定位：** 从技术服务到专业咨询
3. **市场差异化：** 独特的AI法律分析服务
4. **客户粘性：** 购房决策关键环节

### 目标客户
- 首次购房者（需要指导）
- 投资者（需要风险评估）
- 海外买家（不熟悉当地法律）
- 时间紧迫的买家（快速决策）

## 🎯 营销建议

### 内容营销
- 发布Purchase Agreement解读指南
- LIM Report常见问题解析
- 新西兰购房法律风险案例
- 购房决策流程图

### 合作渠道
- 房地产经纪人推荐
- 移民律师合作
- 银行贷款经理介绍
- 会计师和理财顾问推荐

## 🔧 技术优势

### AI增强功能
- **智能文档分类：** 自动识别文档类型
- **风险关键词检测：** 自动标记风险条款
- **紧急程度评估：** 基于内容判断处理优先级
- **法律术语解释：** 专业词汇通俗化解读

### 专业工具集成
- **PDF文本提取：** pdf-parse库处理
- **Word文档处理：** mammoth库支持
- **邮件自动化：** 专业确认和通知
- **工作流管理：** 法律团队任务分配

## 📞 后续支持

### 运营优化
1. **分析转化率：** 各套餐选择比例
2. **优化定价：** A/B测试不同价格点
3. **改进服务：** 基于客户反馈优化流程
4. **扩展服务：** 增加更多法律文档类型

### 技术演进
1. **真实AI集成：** 连接法律AI分析引擎
2. **客户仪表板：** 查看历史咨询记录
3. **实时聊天：** 与法律专家直接沟通
4. **移动应用：** 便携式法律咨询工具

## 🎉 成功指标

升级完成后，你应该能够：
- ✅ 处理PDF法律文档上传
- ✅ 提供三级法律咨询服务
- ✅ 收取$149-499专业服务费
- ✅ 自动生成法律分析报告
- ✅ 建立专业法律咨询品牌

**恭喜！PropertyWise NZ 现在是新西兰专业的房产法律咨询服务平台！** 🏆

---

需要帮助或有任何问题，请联系：legal@propertywise.co.nz
