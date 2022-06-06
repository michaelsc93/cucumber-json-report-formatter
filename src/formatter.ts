import { Helper } from './helper'
import jsonschema from 'jsonschema'
import assert from 'assert'
import path from 'path'

//await parseCucumberJson(sourceFile, outputFile)

export class Formatter {

    helper = new Helper()    

    public async parseCucumberJson(sourceFile: string, outputFile: string) {
        console.info(`Start formatting file '${sourceFile}' into '${outputFile}'`)
        const report = await this.helper.readFileIntoJson(sourceFile)
        const gherkinDocumentJson = this.helper.getJsonFromArray(report, "gherkinDocument")  
        let gherkinDocument: any
        try{
            gherkinDocument = JSON.parse(gherkinDocumentJson[0]).gherkinDocument
        } catch (err) {
            console.error("Error parsing JSON string.", err);
        }
        const feature = gherkinDocument.feature
        const scenarios = feature.children
        const scenariosJson: any [] = []
        const cucumberReport: any [] = []

        scenarios.forEach(child => {
            const steps: any[] = []

            child.scenario.steps.forEach(step => {
                const result = this.getStepResult(step.id, report)
                const match = this.matchStepDefinitions(step.id, report)
                const stepJson = {
                    keyword:  step.keyword,
                    line: step.location.line,
                    name: step.text,
                    result: result,
                    match: match
                }
                steps.push(stepJson)
            })

            const scenario = {
                description: child.scenario.description,
                id: `${feature.name};${child.scenario.name}`,
                keyword: child.scenario.keyword,
                line: child.scenario.location.line,
                name: child.scenario.name,
                steps: steps,
                tags: this.getTags(child.scenario.tags),
                type: "scenario"
            }

            scenariosJson.push(scenario)
        });

        const rootJson = {
            comments: this.getComments(gherkinDocument.comments),
            description: gherkinDocument.feature.description,
            elements: scenariosJson,
            id: feature.name,
            keyword: feature.keyword,
            line: feature.location.line,
            name: feature.name,
            uri: gherkinDocument.uri,
            tags: this.getTags(gherkinDocument.feature.tags)
        }

        cucumberReport.push(rootJson)
        await this.validateReportSchema(report)
        const reportString = JSON.stringify(cucumberReport)
        console.info(`Parsed Cucumber JSON report: ${reportString}`)  
        this.helper.writeFile(outputFile, reportString)
    }


    public getStepResult(stepId, report){
        if (typeof report === "undefined"){
            console.error("Source report is undefined");
            return
        }
        const pickleJson = this.helper.getJsonFromArray(report, "pickle")
        const testStepFinishedJson = this.helper.getJsonFromArray(report, "testStepFinished")
        const pickleStepId = this.getPickleStepIdByStepId(pickleJson, stepId)
        const result = this.getTestStepFinishedResult(testStepFinishedJson, pickleStepId)
        return result
    }

    public matchStepDefinitions(stepId, report){
        if (typeof report === "undefined"){
            console.error("Source report is undefined");
            return
        }
        const pickleJson = this.helper.getJsonFromArray(report, "pickle")
        const testCaseJson = this.helper.getJsonFromArray(report, "testCase")
        const stepDefinitionJson = this.helper.getJsonFromArray(report, "stepDefinition")
        const pickleStepId = this.getPickleStepIdByStepId(pickleJson, stepId)
        const stepDefinitionId = this.getStepDefinitionId(testCaseJson, pickleStepId)
        const match = this.getMatchedStepDefinition(stepDefinitionJson, stepDefinitionId)
        return match
    }


    public getPickleStepIdByStepId(pickleJson, stepId){
        let pickleStepId = ""
        let parsed: any
        pickleJson.forEach(element => {
            if (JSON.stringify(element).includes(stepId)){
                try {
                    parsed = JSON.parse(element)
                } catch (err) {
                    console.error("Error parsing JSON string:", err);
                }
                const pickleSteps = parsed.pickle.steps
                pickleSteps.forEach(step => {
                    if (step.astNodeIds[0] === stepId){
                        pickleStepId = step.id
                    }
                })
            }
        })
        return pickleStepId
    }

    public getTestStepFinishedResult(testStepFinishedJson, pickleStepId){
        let status = ""
        let error_message = null
        const duration = 0
        let parsed: any
        testStepFinishedJson.forEach(stepFinished => {
            if (JSON.stringify(stepFinished).includes(pickleStepId)){
                try {
                    parsed = JSON.parse(stepFinished)
                } catch (err) {
                    console.error("Error parsing JSON string:", err);
                }
                let duration = parsed.testStepFinished.testStepResult.duration
                if (typeof duration !== "undefined"){
                    duration = parsed.testStepFinished.testStepResult.duration.seconds
                }
                status = parsed.testStepFinished.testStepResult.status            
                error_message = parsed.testStepFinished.testStepResult.message
            }
        })

        return {
            status: status,
            duration: duration,
            error_message: error_message
        }
    }

    public getStepDefinitionId(testCaseJson, pickleStepId){
        let stepDefinitionId = ""
        let parsed: any
        testCaseJson.forEach(testCase => {
            if (JSON.stringify(testCase).includes(pickleStepId)){
                try {
                    parsed = JSON.parse(testCase)
                } catch (err) {
                    console.error("Error parsing JSON string:", err);
                }
                const testSteps = parsed.testCase.testSteps

                testSteps.forEach(test => {
                    if (test.pickleStepId === pickleStepId) {
                        stepDefinitionId = test.stepDefinitionIds[0]
                    }
                })
            }
        })
        return stepDefinitionId
    }

    public getMatchedStepDefinition(stepDefinitionJson, stepDefinitionId){
        let uri = ""
        let line = 0
        let parsed: any
        stepDefinitionJson.forEach(stepDef => {
            if (JSON.stringify(stepDef).includes(stepDefinitionId)){
                try {
                    parsed = JSON.parse(stepDef)
                } catch (err) {
                    console.error("Error parsing JSON string:", err);
                }
                uri =  parsed.stepDefinition.sourceReference.uri
                line = parsed.stepDefinition.sourceReference.location.line
            }
        })
        return {
            location: `${uri}:${line}`
        }
    }

    public getTags(tagsJson){
        if (typeof tagsJson === "undefined"){
            return
        }

        const tags: string [] = []
        let tagsParsed: any
        try {
            const tagsString = JSON.stringify(tagsJson)
            tagsParsed = JSON.parse(tagsString)
        } catch (err) {
            console.error("Error parsing JSON string:", err);
        }
        tagsParsed.forEach(tag => {
            tags.push(tag.name)
        })
        return tags
    }

    public getComments(commentsJson){
        if (typeof commentsJson === "undefined"){
            return
        }

        const comments: any [] = []
        let commentsParsed: any
        try {
            const commentsString = JSON.stringify(commentsJson)
            commentsParsed = JSON.parse(commentsString)
        } catch (err) {
            console.error("Error parsing JSON string:", err);
        }
        commentsParsed.forEach(commentItem => {
            const comment = {
                line: commentItem.location.line,
                value: commentItem.text
            }
            comments.push(comment)
        })
        return comments
    }

    public async validateReportSchema(reportJson){
        console.info("Start cucumber report JSON schema validation...")
        const schemaPath = `${__dirname}/model/cucumber_report_schema.json`;
        console.info(`JSON schema path: ${schemaPath}`);
        const schema = await this.helper.readFileIntoJson(schemaPath)
        let parsedSchema: any
        try {
            const schemaString = JSON.stringify(schema)           
            parsedSchema = JSON.parse(schemaString)
        } catch (err) {
            console.error("Error parsing JSON string:", err);
        }

        const validator = new jsonschema.Validator();
        const result = validator.validate(reportJson, parsedSchema)
        assert.ok(result, `JSON schama validation failed for report: ${reportJson}`)
        console.info("Cucumber report JSON schema validation passed!")    
    }
}