function e(e,t,n=` `){let r=String(e??``).slice(0,t);return r.length>=t?r:r+n.repeat(t-r.length)}function t(e,t,n=`0`){let r=String(e??``).slice(-t);return r.length>=t?r:n.repeat(t-r.length)+r}function n(e){return String(e??``).replace(/[<>&'"]/g,e=>({"<":`&lt;`,">":`&gt;`,"&":`&amp;`,"'":`&apos;`,'"':`&quot;`})[e])}function r(e){return String(Math.round(e*100))}function i(e){return e.replace(`-`,``)}function a(n,a){let o=new Date,s=i(n.period),c=[];c.push([e(`H`,1),t(s,8),e(a.name,40),e(a.id,12),t(String(o.getFullYear()),4),t(String(o.getMonth()+1),2),t(String(o.getDate()),2),t(n.lines.length,6),t(r(n.totalAmount),12),e(`ILS`,3),e(``,128).slice(u())].join(``).slice(0,128));for(let i of n.lines)c.push([e(`D`,1),t(i.employeeId.replace(/\D/g,``)||`0`,10),e(i.employeeName,30),e(i.bankCode,3),t(i.branchCode,4),t(i.accountNumber,12),t(r(i.amount),12),e(`ILS`,3),e(i.narrative,40),e(``,128).slice(d())].join(``).slice(0,128));c.push([e(`T`,1),t(n.lines.length,6),t(r(n.totalAmount),12),e(``,128).slice(f())].join(``).slice(0,128));let l=new Blob([c.join(`\r
`)+`\r
`],{type:`text/plain; charset=iso-8859-8`});return{filename:`masav-${n.legalEntityId}-${s}.txt`,mime:`text/plain`,bytes:l};function u(){return 90}function d(){return 115}function f(){return 19}}function o(e,t,r){let a=t.reduce((e,t)=>({gross:e.gross+t.calc.grossPay,taxable:e.taxable+t.calc.taxableGross,tax:e.tax+t.calc.incomeTaxNet,niEmp:e.niEmp+t.calc.employeeNI,niEr:e.niEr+t.calc.employerNI,health:e.health+t.calc.employeeHealth}),{gross:0,taxable:0,tax:0,niEmp:0,niEr:0,health:0}),o=`<?xml version="1.0" encoding="UTF-8"?>
<Form102 xmlns="urn:il:ita:form-102:v1">
  <Header>
    <FormType>102</FormType>
    <Version>1.0</Version>
    <ReportingPeriod>${n(e.period)}</ReportingPeriod>
    <TaxYear>${n(e.period.slice(0,4))}</TaxYear>
    <GeneratedAt>${n(new Date().toISOString())}</GeneratedAt>
  </Header>
  <Employer>
    <Name>${n(r.name)}</Name>
    <EntityId>${n(r.id)}</EntityId>
    <Country>${n(r.country)}</Country>
    <Currency>${n(r.currency)}</Currency>
  </Employer>
  <EmployeeCount>${t.length}</EmployeeCount>
  <Totals currency="ILS">
    <GrossSalary>${a.gross.toFixed(2)}</GrossSalary>
    <TaxableGross>${a.taxable.toFixed(2)}</TaxableGross>
    <IncomeTaxWithheld>${a.tax.toFixed(2)}</IncomeTaxWithheld>
    <NationalInsuranceEmployee>${a.niEmp.toFixed(2)}</NationalInsuranceEmployee>
    <NationalInsuranceEmployer>${a.niEr.toFixed(2)}</NationalInsuranceEmployer>
    <HealthInsurance>${a.health.toFixed(2)}</HealthInsurance>
  </Totals>
  <RegulatoryRuleSet>${n(e.regulatoryVersion)}</RegulatoryRuleSet>
  <CalculationVersion>${n(e.calculationVersion)}</CalculationVersion>
</Form102>`;return{filename:`form-102-${e.legalEntityId}-${i(e.period)}.xml`,mime:`application/xml`,bytes:new Blob([o],{type:`application/xml; charset=utf-8`})}}function s(e,t,r,i,a){let o=`<?xml version="1.0" encoding="UTF-8"?>
<Form106 xmlns="urn:il:ita:form-106:v1">
  <Header>
    <FormType>106</FormType>
    <TaxYear>${e}</TaxYear>
    <GeneratedAt>${n(new Date().toISOString())}</GeneratedAt>
  </Header>
  <Employer>
    <Name>${n(a.name)}</Name>
    <EntityId>${n(a.id)}</EntityId>
  </Employer>
  <Employee>
    <Name>${n(t.name)}</Name>
    <EmployeeId>${n(t.id)}</EmployeeId>
    <NationalId masked="true">${n(`******`+(r.nationalId??``).slice(-3))}</NationalId>
    <MonthsWorked>${i.monthsWorked}</MonthsWorked>
  </Employee>
  <AnnualTotals currency="ILS">
    <GrossSalary>${i.ytdGross.toFixed(2)}</GrossSalary>
    <TaxableIncome>${i.ytdTaxable.toFixed(2)}</TaxableIncome>
    <IncomeTaxWithheld>${i.ytdIncomeTax.toFixed(2)}</IncomeTaxWithheld>
    <NationalInsurance>${i.ytdNI.toFixed(2)}</NationalInsurance>
    <HealthInsurance>${i.ytdHealth.toFixed(2)}</HealthInsurance>
    <PensionEmployeeContrib>${i.ytdPensionEmployee.toFixed(2)}</PensionEmployeeContrib>
    <PensionEmployerContrib>${i.ytdPensionEmployer.toFixed(2)}</PensionEmployerContrib>
    <SeveranceContrib>${i.ytdSeverance.toFixed(2)}</SeveranceContrib>
    <CreditPointsClaimed>${r.taxProfile.creditPoints}</CreditPointsClaimed>
  </AnnualTotals>
</Form106>`;return{filename:`form-106-${t.id}-${e}.xml`,mime:`application/xml`,bytes:new Blob([o],{type:`application/xml; charset=utf-8`})}}function c(e,t,n,r){let a=[[`RunPeriod`,`EmployerName`,`EmployerId`,`EmployeeId`,`EmployeeName`,`FundProvider`,`FundType`,`PolicyNumber`,`PensionableSalary`,`EmployeeRate`,`EmployerRate`,`SeveranceRate`,`EmployeeAmount`,`EmployerAmount`,`SeveranceAmount`,`TotalAmount`,`Saf14Applies`,`RuleSet`].join(`|`)];for(let i of t){let t=n.find(e=>e.id===i.payrollEmployeeId);if(t)for(let n of t.pensionFunds.filter(e=>e.status===`active`)){let o=i.calc.pensionableSalary,s=o*n.employeeRate,c=o*n.employerRate,l=o*n.severanceRate;a.push([e.period,r.name,r.id,i.employeeId,t.englishName,n.provider,n.fundType,n.policyNumber??``,o.toFixed(2),n.employeeRate.toFixed(4),n.employerRate.toFixed(4),n.severanceRate.toFixed(4),s.toFixed(2),c.toFixed(2),l.toFixed(2),(s+c+l).toFixed(2),n.saf14Applies?`Y`:`N`,e.regulatoryVersion].map(e=>String(e).replace(/[|\r\n]/g,` `)).join(`|`))}}let o=new Blob([a.join(`\r
`)+`\r
`],{type:`text/plain; charset=utf-8`});return{filename:`memshak-maasikim-${e.legalEntityId}-${i(e.period)}.txt`,mime:`text/plain`,bytes:o}}function l(e,t,r,a){let o=new Map;for(let e of r){let t=o.get(e.employeeId)??{gross:0,tax:0,ni:0,health:0,months:new Set};t.gross+=e.calc.grossPay,t.tax+=e.calc.incomeTaxNet,t.ni+=e.calc.employeeNI,t.health+=e.calc.employeeHealth,t.months.add(e.period),o.set(e.employeeId,t)}let s=`<?xml version="1.0" encoding="UTF-8"?>
<Form126 xmlns="urn:il:ita:form-126:v1">
  <Header>
    <FormType>126</FormType>
    <PeriodFrom>${n(e)}</PeriodFrom>
    <PeriodTo>${n(t)}</PeriodTo>
    <GeneratedAt>${n(new Date().toISOString())}</GeneratedAt>
  </Header>
  <Employer>
    <Name>${n(a.name)}</Name>
    <EntityId>${n(a.id)}</EntityId>
  </Employer>
  <Employees>
${Array.from(o.entries()).map(([e,t])=>`    <Employee id="${n(e)}">
      <MonthsIncluded>${t.months.size}</MonthsIncluded>
      <Gross>${t.gross.toFixed(2)}</Gross>
      <IncomeTax>${t.tax.toFixed(2)}</IncomeTax>
      <NI>${t.ni.toFixed(2)}</NI>
      <Health>${t.health.toFixed(2)}</Health>
    </Employee>`).join(`
`)}
  </Employees>
</Form126>`;return{filename:`form-126-${a.id}-${i(e)}-${i(t)}.xml`,mime:`application/xml`,bytes:new Blob([s],{type:`application/xml; charset=utf-8`})}}function u(e,t,r,i,a,o,s,c){let l=`<?xml version="1.0" encoding="UTF-8"?>
<Form161 xmlns="urn:il:ita:form-161:v1">
  <Header>
    <FormType>161</FormType>
    <GeneratedAt>${n(new Date().toISOString())}</GeneratedAt>
  </Header>
  <Employer>
    <Name>${n(c.name)}</Name>
    <EntityId>${n(c.id)}</EntityId>
  </Employer>
  <Employee>
    <Name>${n(e.name)}</Name>
    <EmployeeId>${n(e.id)}</EmployeeId>
    <SeniorityDate>${n(t.seniorityDate)}</SeniorityDate>
    <TerminationDate>${n(r)}</TerminationDate>
  </Employee>
  <Settlement currency="ILS">
    <VacationRedemption>${a.toFixed(2)}</VacationRedemption>
    <HavraaRedemption>${o.toFixed(2)}</HavraaRedemption>
    <TotalFinalSettlement>${i.toFixed(2)}</TotalFinalSettlement>
    <SectionFourteen>${s?`true`:`false`}</SectionFourteen>
  </Settlement>
</Form161>`;return{filename:`form-161-${e.id}-${r.replace(/-/g,``)}.xml`,mime:`application/xml`,bytes:new Blob([l],{type:`application/xml; charset=utf-8`})}}function d(e){let t=URL.createObjectURL(e.bytes),n=document.createElement(`a`);n.href=t,n.download=e.filename,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t)}export{d as downloadBlob,o as exportForm102,s as exportForm106,l as exportForm126,u as exportForm161,a as exportMasav,c as exportMemshakMaasikim};