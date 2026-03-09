import * as echarts from 'echarts'

interface ApiResponse {
  data: {
    data: {
      [key: string]: Array<{
        date: string
        total_prompt_tokens: number
        total_completion_tokens: number
        total_tokens: number
        total_cost: number
        usage_count: number
      }>
    }
    results: Array<{
      log_model: string
      date: string
      total_prompt_tokens: string
      total_completion_tokens: string
      total_tokens: string
      total_cost: string
      usage_count: string
    }>
  }
}

function generateLineChartConfig(responseData: any) {
  const models = Object.keys(responseData.data.data)
  const dates = [...new Set(responseData.data.results.map((result: any) => result.date))].sort()

  const seriesData = models.map((model) => {
    return {
      name: model,
      type: 'line',
      data: dates.map((date) => {
        const modelData = responseData.data.data[model]
        if (modelData) {
          const entry = modelData.find((item: any) => item.date === date)
          return entry ? entry.total_tokens : 0
        }
        return 0
      }),
    }
  })

  const totalUsageData = dates.map((date) => {
    const totalEntry = models.reduce((total: any, model) => {
      const modelData = responseData.data.data[model]
      if (modelData) {
        const entry = modelData.find((item: any) => item.date === date)
        return {
          total_prompt_tokens: total.total_prompt_tokens + (entry ? entry.total_prompt_tokens : 0),
          total_completion_tokens: total.total_completion_tokens + (entry ? entry.total_completion_tokens : 0),
          total_tokens: total.total_tokens + (entry ? entry.total_tokens : 0),
          total_cost: total.total_cost + (entry ? entry.total_cost : 0),
          usage_count: total.usage_count + (entry ? entry.usage_count : 0),
        }
      }
      return total
    }, {
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      usage_count: 0,
    })
    return totalEntry
  })

  const baseCost = Math.min(...totalUsageData.map(entry => entry.total_cost))
  const adjustedTotalUsageData = totalUsageData.map(entry => ({
    ...entry,
    adjusted_cost: entry.total_cost - baseCost,
  }))

  seriesData.push({
    name: '总调用量',
    type: 'line',
    data: totalUsageData.map(entry => entry.total_tokens),
  })

  return {
    title: {
      text: '模型调用趋势图',
      subtext: '不同模型趋势图',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        animation: false,
        label: {
          backgroundColor: '#ccc',
          borderColor: '#aaa',
          borderWidth: 1,
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          color: '#222',
        },
      },
      formatter(params: any) {
        let tooltipContent = `${params[0].name}<br>`
        params.forEach((param: any) => {
          if (param.seriesName !== '总调用量') {
            const modelData = responseData.data.data[param.seriesName]
            const entry = modelData ? modelData.find((item: any) => item.date === param.name) : null

            if (entry) {
              tooltipContent += `${param.seriesName}: <br>`
              tooltipContent += `  - Total Tokens: ${entry.total_tokens}<br>`
              tooltipContent += `  - Prompt/Completion: ${entry.total_prompt_tokens}/${entry.total_completion_tokens}<br>`
              tooltipContent += `  - Usage Count: ${entry.usage_count}($${entry.total_cost.toFixed(6)})<br>`
            }
            else {
              tooltipContent += `${param.seriesName}: 无数据<br>`
            }
          }
          else {
            const totalEntry = totalUsageData[dates.indexOf(param.name)]
            tooltipContent += `${param.seriesName}: <br>`
            tooltipContent += `  - Total Tokens: ${totalEntry.total_tokens}<br>`
            tooltipContent += `  - Prompt/Completion: ${totalEntry.total_prompt_tokens}/${totalEntry.total_completion_tokens}<br>`
            tooltipContent += `  - Usage Count: ${totalEntry.usage_count}($${totalEntry.total_cost.toFixed(6)})<br>`
          }
        })
        return tooltipContent
      },
    },
    legend: {
      data: [...models, '总调用量'],
      bottom: 0,
    },
    xAxis: {
      type: 'category',
      data: dates,
    },
    yAxis: {
      type: 'value',
    },
    series: seriesData,
  }
}

function initLinearECharts(el: HTMLElement, responseData: ApiResponse) {
  const option = generateLineChartConfig(responseData)
  const models = Object.keys(responseData.data.data)
  const dates = [...new Set(responseData.data.results.map(result => result.date))].sort()

  // const option = {
  //   title: {
  //     text: '模型调用趋势图',
  //   },
  //   tooltip: {
  //     trigger: 'axis',
  //   },
  //   legend: {
  //     data: models,
  //   },
  //   xAxis: {
  //     type: 'category',
  //     data: dates,
  //   },
  //   yAxis: {
  //     type: 'value',
  //   },
  //   series: seriesData,
  // }

  const myChart = echarts.init(el)
  myChart.setOption(option)
}

export { initLinearECharts, generateLineChartConfig }
