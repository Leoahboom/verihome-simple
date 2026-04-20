# VeriHome - Simple HTML Version

这是一个简化的 HTML 版本的房屋检查报告网站，可以立即部署到 Vercel 用于 Stripe 申请。

## 功能特性

✅ **响应式设计** - 在所有设备上都能完美显示
✅ **专业外观** - 现代、干净的设计风格
✅ **文件上传** - 支持拖拽上传房屋照片
✅ **AI 分析模拟** - 展示分析结果界面
✅ **Stripe 集成准备** - 包含支付流程框架
✅ **SEO 友好** - 适合搜索引擎优化

## 快速部署到 Vercel

1. **上传文件到新的 GitHub 仓库:**
   - 创建新仓库名为 `verihome-simple`
   - 上传 `verihome-simple.html` 和 `vercel.json`

2. **连接到 Vercel:**
   - 登录 https://vercel.com
   - 点击 "New Project"
   - 选择你的 GitHub 仓库
   - 点击 "Deploy"

3. **配置域名:**
   - 在 Vercel 项目设置中添加自定义域名
   - 指向 `verihome.co.nz`

## Stripe 集成步骤

1. **申请 Stripe 账户:**
   - 访问 https://stripe.com/nz
   - 使用这个部署的网站作为业务网站
   - 说明提供房屋检查报告服务

2. **获取 API 密钥后:**
   - 替换 HTML 中的 `pk_test_YOUR_STRIPE_PUBLISHABLE_KEY_HERE`
   - 添加后端 API 端点来处理支付

3. **创建 Stripe Checkout:**
   ```javascript
   // 在 startPayment() 函数中取消注释代码
   // 添加后端 API 来创建 Checkout Session
   ```

## 网站结构

- **首页:** 吸引人的 Hero 部分
- **上传区域:** 文件上传和拖拽功能
- **分析结果:** 模拟 AI 分析展示
- **定价:** Stripe 支付集成点
- **联系信息:** 专业联系方式

## 优势

1. **立即可部署** - 纯 HTML/CSS/JS，无构建过程
2. **快速加载** - 静态文件，极佳性能
3. **专业外观** - 适合向 Stripe 展示真实业务
4. **易于维护** - 简单的单文件结构

## 下一步

部署成功后，你可以：
1. 使用这个网站申请 Stripe 账户
2. 获得 API 密钥后添加真实的支付功能
3. 逐步添加更多功能（用户账户、报告生成等）

## 联系

如需帮助，请联系 info@verihome.co.nz
