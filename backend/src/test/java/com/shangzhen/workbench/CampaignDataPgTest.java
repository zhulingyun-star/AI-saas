package com.shangzhen.workbench;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 同一组投流用例（CampaignDataTest）跑在真的 PostgreSQL 上，验证聚合 SQL、约束和迁移在 PostgreSQL 下也对。
 * 只在设了 PG_APP_URL（以及 PG_USER / PG_PASSWORD）时跑；平时（只有 H2）自动跳过。
 */
@EnabledIfEnvironmentVariable(named="PG_APP_URL",matches=".+")
@SpringBootTest(properties={"spring.datasource.url=${PG_APP_URL}","spring.datasource.username=${PG_USER}","spring.datasource.password=${PG_PASSWORD}",
    "app.storage=./target/campaign-pg-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000",
    "app.remake-draft.poll-delay=3600000","app.ai.mode=local","app.suggestions.cron=-"})
@AutoConfigureMockMvc
class CampaignDataPgTest extends CampaignDataTest {}
